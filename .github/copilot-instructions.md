# ioBroker Adapter Development with GitHub Copilot

**Version:** 0.5.7
**Template Source:** https://github.com/DrozmotiX/ioBroker-Copilot-Instructions

This file contains instructions and best practices for GitHub Copilot when working on ioBroker adapter development.

---

## 📑 Table of Contents

1. [Project Context](#project-context)
2. [Code Quality & Standards](#code-quality--standards)
   - [Code Style Guidelines](#code-style-guidelines)
   - [ESLint Configuration](#eslint-configuration)
3. [Testing](#testing)
   - [Unit Testing](#unit-testing)
   - [Integration Testing](#integration-testing)
   - [API Testing with Credentials](#api-testing-with-credentials)
4. [Development Best Practices](#development-best-practices)
   - [Dependency Management](#dependency-management)
   - [HTTP Client Libraries](#http-client-libraries)
   - [Error Handling](#error-handling)
5. [Admin UI Configuration](#admin-ui-configuration)
   - [JSON-Config Setup](#json-config-setup)
   - [Translation Management](#translation-management)
6. [Documentation](#documentation)
   - [README Updates](#readme-updates)
   - [Changelog Management](#changelog-management)
7. [CI/CD & GitHub Actions](#cicd--github-actions)
   - [Workflow Configuration](#workflow-configuration)
   - [Testing Integration](#testing-integration)

---

## Project Context

You are working on an ioBroker adapter. ioBroker is an integration platform for the Internet of Things, focused on building smart home and industrial IoT solutions. Adapters are plugins that connect ioBroker to external systems, devices, or services.

**TR-064 Adapter Specific Context:**
This is the TR-064 adapter for controlling AVM Fritz!Box routers and retrieving network status information. The adapter provides:

- **Device Control**: Turn WiFi on/off (2.4GHz and 5GHz), manage guest WiFi, reboot Fritz!Box
- **Call Monitoring**: Real-time call state tracking for incoming/outgoing calls with caller ID resolution
- **Phonebook Integration**: Automatic resolution of phone numbers to names and contact images
- **Device Presence Detection**: Monitor connected devices to track when family members arrive/leave
- **Call Lists**: Access to missed, inbound, outbound call history in JSON/HTML formats
- **Advanced Commands**: Execute TR-064 service commands directly via command state
- **Ring Function**: Dial internal/external numbers programmatically

**Key Technologies:**
- TR-064 Protocol for AVM Fritz!Box communication
- mDNS Discovery for automatic Fritz!Box detection
- XML parsing for TR-064 service responses
- Real-time TCP/IP call monitoring on port 1012
- Password encryption using ioBroker's built-in encryption

---

## Code Quality & Standards

### Code Style Guidelines

- Follow JavaScript/TypeScript best practices
- Use async/await for asynchronous operations
- Implement proper resource cleanup in `unload()` method
- Use semantic versioning for adapter releases
- Include proper JSDoc comments for public methods

**Timer and Resource Cleanup Example:**
```javascript
private connectionTimer?: NodeJS.Timeout;

async onReady() {
  this.connectionTimer = setInterval(() => this.checkConnection(), 30000);
}

onUnload(callback) {
  try {
    if (this.connectionTimer) {
      clearInterval(this.connectionTimer);
      this.connectionTimer = undefined;
    }
    callback();
  } catch (e) {
    callback();
  }
}
```

### ESLint Configuration

**CRITICAL:** ESLint validation must run FIRST in your CI/CD pipeline, before any other tests. This "lint-first" approach catches code quality issues early.

#### Setup
```bash
npm install --save-dev eslint @iobroker/eslint-config
```

#### Configuration (.eslintrc.json)
```json
{
  "extends": "@iobroker/eslint-config",
  "rules": {
    // Add project-specific rule overrides here if needed
  }
}
```

#### Package.json Scripts
```json
{
  "scripts": {
    "lint": "eslint --max-warnings 0 .",
    "lint:fix": "eslint . --fix"
  }
}
```

#### Best Practices
1. ✅ Run ESLint before committing — fix ALL warnings, not just errors
2. ✅ Use `lint:fix` for auto-fixable issues
3. ✅ Don't disable rules without documentation
4. ✅ Lint all relevant files (main code, tests, build scripts)
5. ✅ Keep `@iobroker/eslint-config` up to date
6. ✅ **ESLint warnings are treated as errors in CI** (`--max-warnings 0`). The `lint` script above already includes this flag — run `npm run lint` to match CI behavior locally

#### Common Issues
- **Unused variables**: Remove or prefix with underscore (`_variable`)
- **Missing semicolons**: Run `npm run lint:fix`
- **Indentation**: Use 4 spaces (ioBroker standard)
- **console.log**: Replace with `adapter.log.debug()` or remove

---

## Testing

### Unit Testing

- Use Jest as the primary testing framework for ioBroker adapters
- Create tests for all adapter main functions and helper methods
- Test error handling scenarios and edge cases
- Mock external API calls and hardware dependencies
- For adapters connecting to APIs/devices not reachable by internet, provide example data files to allow testing of functionality without live connections

**Example Structure:**
```javascript
describe('AdapterName', () => {
  let adapter;
  
  beforeEach(() => {
    // Setup test adapter instance
  });
  
  test('should initialize correctly', () => {
    // Test adapter initialization
  });
});
```

### Integration Testing

**CRITICAL:** Use the official `@iobroker/testing` framework. This is the ONLY correct way to test ioBroker adapters.

**Official Documentation:** https://github.com/ioBroker/testing

#### Framework Structure

**✅ Correct Pattern:**
```javascript
const path = require('path');
const { tests } = require('@iobroker/testing');

tests.integration(path.join(__dirname, '..'), {
    defineAdditionalTests({ suite }) {
        suite('Test adapter with specific configuration', (getHarness) => {
            let harness;

            before(() => {
                harness = getHarness();
            });

            it('should configure and start adapter', function () {
                return new Promise(async (resolve, reject) => {
                    try {
                        // Get adapter object
                        const obj = await new Promise((res, rej) => {
                            harness.objects.getObject('system.adapter.your-adapter.0', (err, o) => {
                                if (err) return rej(err);
                                res(o);
                            });
                        });
                        
                        if (!obj) return reject(new Error('Adapter object not found'));

                        // Configure adapter
                        Object.assign(obj.native, {
                            position: '52.520008,13.404954',
                            createHourly: true,
                        });

                        harness.objects.setObject(obj._id, obj);
                        
                        // Start and wait
                        await harness.startAdapterAndWait();
                        await new Promise(resolve => setTimeout(resolve, 15000));

                        // Verify states
                        const stateIds = await harness.dbConnection.getStateIDs('your-adapter.0.*');
                        
                        if (stateIds.length > 0) {
                            console.log('✅ Adapter successfully created states');
                            await harness.stopAdapter();
                            resolve(true);
                        } else {
                            reject(new Error('Adapter did not create any states'));
                        }
                    } catch (error) {
                        reject(error);
                    }
                });
            }).timeout(40000);
        });
    }
});
```

#### Testing Success AND Failure Scenarios

**IMPORTANT:** For every "it works" test, implement corresponding "it fails gracefully" tests.

**TR-064 Specific Integration Testing Patterns:**

```javascript
// TR-064 adapter integration test example
tests.integration(path.join(__dirname, '..'), {
    defineAdditionalTests({ suite }) {
        suite('TR-064 Fritz!Box Connection Tests', (getHarness) => {
            it('should connect to Fritz!Box and retrieve basic info', async function() {
                const harness = getHarness();
                
                // Configure with test Fritz!Box credentials
                const obj = await harness.objects.getObjectAsync('system.adapter.tr-064.0');
                Object.assign(obj.native, {
                    iporhost: 'fritz.box',
                    user: 'testuser',
                    password: 'encrypted_password',
                    pollingInterval: 10,
                    useCallMonitor: false, // Disable for basic test
                    usePhonebook: false,
                    useDevices: false
                });
                
                await harness.objects.setObjectAsync(obj._id, obj);
                await harness.startAdapterAndWait();
                
                // Wait for connection attempt
                await new Promise(resolve => setTimeout(resolve, 15000));
                
                // Check connection state
                const connectionState = await harness.states.getStateAsync('tr-064.0.info.connection');
                expect(connectionState).to.exist;
                
                // Check basic states are created
                const externalIPState = await harness.states.getStateAsync('tr-064.0.states.externalIP');
                expect(externalIPState).to.exist;
            });
        });
        
        suite('TR-064 Error Handling', (getHarness) => {
            it('should handle invalid Fritz!Box credentials gracefully', async function() {
                const harness = getHarness();
                
                const obj = await harness.objects.getObjectAsync('system.adapter.tr-064.0');
                Object.assign(obj.native, {
                    iporhost: 'invalid.host',
                    user: 'invalid',
                    password: 'invalid'
                });
                
                await harness.objects.setObjectAsync(obj._id, obj);
                await harness.startAdapterAndWait();
                await new Promise(resolve => setTimeout(resolve, 10000));
                
                // Check that adapter handles error gracefully
                const connectionState = await harness.states.getStateAsync('tr-064.0.info.connection');
                expect(connectionState.val).to.be.false;
            });
        });
    }
});
```

#### Key Rules

1. ✅ Use `@iobroker/testing` framework
2. ✅ Configure via `harness.objects.setObject()`
3. ✅ Start via `harness.startAdapterAndWait()`
4. ✅ Verify states via `harness.states.getState()`
5. ✅ Allow proper timeouts for async operations
6. ❌ NEVER test API URLs directly
7. ❌ NEVER bypass the harness system

#### Workflow Dependencies

Integration tests should run ONLY after lint and adapter tests pass:

```yaml
integration-tests:
  needs: [check-and-lint, adapter-tests]
  runs-on: ubuntu-22.04
```

### API Testing with Credentials

For adapters connecting to external APIs requiring authentication:

#### Password Encryption for Integration Tests

```javascript
async function encryptPassword(harness, password) {
    const systemConfig = await harness.objects.getObjectAsync("system.config");
    if (!systemConfig?.native?.secret) {
        throw new Error("Could not retrieve system secret for password encryption");
    }
    
    const secret = systemConfig.native.secret;
    let result = '';
    for (let i = 0; i < password.length; ++i) {
        result += String.fromCharCode(secret[i % secret.length].charCodeAt(0) ^ password.charCodeAt(i));
    }
    return result;
}
```

#### TR-064 Demo Testing Pattern

```javascript
// TR-064 adapter demo testing with Fritz!Box simulator
tests.integration(path.join(__dirname, ".."), {
    defineAdditionalTests({ suite }) {
        suite("Fritz!Box Demo Connection", (getHarness) => {
            it("Should simulate Fritz!Box connection for CI testing", async () => {
                const harness = getHarness();
                
                // Test with demo configuration
                await harness.changeAdapterConfig("tr-064", {
                    native: {
                        iporhost: "demo.fritz.box",
                        user: "demo",
                        password: await encryptPassword(harness, "demo123"),
                        useCallMonitor: false, // Disable for CI
                        usePhonebook: false,
                        useDevices: false
                    }
                });
                
                await harness.startAdapter();
                await new Promise(resolve => setTimeout(resolve, 30000));
                
                // Verify basic functionality without real Fritz!Box
                const connectionState = await harness.states.getStateAsync("tr-064.0.info.connection");
                expect(connectionState).to.exist;
            });
        });
    }
});
```

---

## Development Best Practices

### Dependency Management

- Always use `npm` for dependency management
- Use `npm ci` for installing existing dependencies (respects package-lock.json)
- Use `npm install` only when adding or updating dependencies
- Keep dependencies minimal and focused
- Only update dependencies in separate Pull Requests

**When modifying package.json:**
1. Run `npm install` to sync package-lock.json
2. Commit both package.json and package-lock.json together

**Best Practices:**
- Prefer built-in Node.js modules when possible
- Use `@iobroker/adapter-core` for adapter base functionality
- Avoid deprecated packages
- Document specific version requirements

### HTTP Client Libraries

- **Preferred:** Use native `fetch` API (Node.js 20+ required)
- **Avoid:** `axios` unless specific features are required

**Example with fetch:**
```javascript
try {
  const response = await fetch('https://api.example.com/data');
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  const data = await response.json();
} catch (error) {
  this.log.error(`API request failed: ${error.message}`);
}
```

**Other Recommendations:**
- **Logging:** Use adapter built-in logging (`this.log.*`)
- **Scheduling:** Use adapter built-in timers and intervals
- **File operations:** Use Node.js `fs/promises`
- **Configuration:** Use adapter config system

### Error Handling

- Always catch and log errors appropriately
- Use adapter log levels (error, warn, info, debug)
- Provide meaningful, user-friendly error messages
- Handle network failures gracefully
- Implement retry mechanisms where appropriate
- Always clean up timers, intervals, and resources in `unload()` method

**TR-064 Error Handling Examples:**
```javascript
// TR-064 service call pattern with error handling
async callTR064Service(service, action, params = {}) {
    try {
        const result = await this.tr064Client.invoke(service, action, params);
        this.log.debug(`TR-064 ${action} successful`);
        return result;
    } catch (error) {
        this.log.error(`TR-064 ${action} failed: ${error.message}`);
        throw error;
    }
}

// Device presence checking with graceful error handling
async checkDevicePresence(macAddress) {
    try {
        const result = await this.callTR064Service(
            'urn:dslforum-org:service:Hosts:1',
            'GetSpecificHostEntry',
            { NewMACAddress: macAddress }
        );
        return result.NewActive === '1';
    } catch (error) {
        this.log.debug(`Device ${macAddress} not found or inactive`);
        return false;
    }
}
```

---

## Admin UI Configuration

### JSON-Config Setup

Use JSON-Config format for modern ioBroker admin interfaces.

**Example Structure:**
```json
{
  "type": "panel",
  "items": {
    "host": {
      "type": "text",
      "label": "Host address",
      "help": "IP address or hostname of the device"
    }
  }
}
```

**Guidelines:**
- ✅ Use consistent naming conventions
- ✅ Provide sensible default values
- ✅ Include validation for required fields
- ✅ Add tooltips for complex options
- ✅ Ensure translations for all supported languages (minimum English and German)
- ✅ Write end-user friendly labels, avoid technical jargon

### Translation Management

**CRITICAL:** Translation files must stay synchronized with `admin/jsonConfig.json`. Orphaned keys or missing translations cause UI issues and PR review delays.

#### Overview
- **Location:** `admin/i18n/{lang}/translations.json` for 11 languages (de, en, es, fr, it, nl, pl, pt, ru, uk, zh-cn)
- **Source of truth:** `admin/jsonConfig.json` - all `label` and `help` properties must have translations
- **Command:** `npm run translate` - auto-generates translations but does NOT remove orphaned keys
- **Formatting:** English uses tabs, other languages use 4 spaces

#### Critical Rules
1. ✅ Keys must match exactly with jsonConfig.json
2. ✅ No orphaned keys in translation files
3. ✅ All translations must be in native language (no English fallbacks)
4. ✅ Keys must be sorted alphabetically

#### Workflow for Translation Updates

**When modifying admin/jsonConfig.json:**

1. Make your changes to labels/help texts
2. Run automatic translation: `npm run translate`
3. Run validation and remove orphaned keys manually from all translation files
4. Run: `npm run lint && npm run test`

#### Translation Checklist

Before committing changes to admin UI or translations:
1. ✅ No orphaned keys in any translation file
2. ✅ All translations in native language
3. ✅ Keys alphabetically sorted
4. ✅ `npm run lint` passes
5. ✅ `npm run test` passes
6. ✅ Admin UI displays correctly

---

## Documentation

### README Updates

#### Required Sections
1. **Installation** - Clear npm/ioBroker admin installation steps
2. **Configuration** - Detailed configuration options with examples
3. **Usage** - Practical examples and use cases
4. **Changelog** - Version history (use "## **WORK IN PROGRESS**" for ongoing changes)
5. **License** - License information (typically MIT for ioBroker adapters)
6. **Support** - Links to issues, discussions, community support

#### Documentation Standards
- Use clear, concise language
- Include code examples for configuration
- Add screenshots for admin interface when applicable
- Maintain multilingual support (minimum English and German)
- Always reference issues in commits and PRs (e.g., "fixes #xx")

#### Mandatory README Updates for PRs

For **every PR or new feature**, always add a user-friendly entry to README.md:

- Add entries under `## **WORK IN PROGRESS**` section
- Use format: `* (author) **TYPE**: Description of user-visible change`
- Types: **NEW** (features), **FIXED** (bugs), **ENHANCED** (improvements), **TESTING** (test additions), **CI/CD** (automation)
- Focus on user impact, not technical details

**Example:**
```markdown
## **WORK IN PROGRESS**

* (DutchmanNL) **FIXED**: Adapter now properly validates login credentials (fixes #25)
* (DutchmanNL) **NEW**: Added device discovery to simplify initial setup
```

### Changelog Management

Follow the [AlCalzone release-script](https://github.com/AlCalzone/release-script) standard.

#### Format Requirements

```markdown
# Changelog

<!--
  Placeholder for the next version (at the beginning of the line):
  ## **WORK IN PROGRESS**
-->

## **WORK IN PROGRESS**

- (author) **NEW**: Added new feature X
- (author) **FIXED**: Fixed bug Y (fixes #25)

## v0.1.0 (2023-01-01)
Initial release
```

#### Workflow Process
- **During Development:** All changes go under `## **WORK IN PROGRESS**`
- **For Every PR:** Add user-facing changes to WORK IN PROGRESS section
- **Before Merge:** Version number and date added when merging to main
- **Release Process:** Release-script automatically converts placeholder to actual version

#### Change Entry Format
- Format: `- (author) **TYPE**: User-friendly description`
- Types: **NEW**, **FIXED**, **ENHANCED**
- Focus on user impact, not technical implementation
- Reference issues: "fixes #XX" or "solves #XX"

---

## CI/CD & GitHub Actions

### Workflow Configuration

#### GitHub Actions Best Practices

**Must use ioBroker official testing actions:**
- `ioBroker/testing-action-check@v1` for lint and package validation
- `ioBroker/testing-action-adapter@v1` for adapter tests
- `ioBroker/testing-action-deploy@v1` for automated releases with Trusted Publishing (OIDC)

**Configuration:**
- **Node.js versions:** Test on 20.x, 22.x, 24.x
- **Platform:** Use ubuntu-22.04
- **Automated releases:** Deploy to npm on version tags (requires NPM Trusted Publishing)
- **Monitoring:** Include Sentry release tracking for error monitoring

#### Critical: Lint-First Validation Workflow

**ALWAYS run ESLint checks BEFORE other tests.** Benefits:
- Catches code quality issues immediately
- Prevents wasting CI resources on tests that would fail due to linting errors
- Provides faster feedback to developers
- Enforces consistent code quality

**Workflow Dependency Configuration:**
```yaml
jobs:
  check-and-lint:
    # Runs ESLint and package validation
    # Uses: ioBroker/testing-action-check@v1
    
  adapter-tests:
    needs: [check-and-lint]  # Wait for linting to pass
    # Run adapter unit tests
    
  integration-tests:
    needs: [check-and-lint, adapter-tests]  # Wait for both
    # Run integration tests
```

**Key Points:**
- The `check-and-lint` job has NO dependencies - runs first
- ALL other test jobs MUST list `check-and-lint` in their `needs` array
- If linting fails, no other tests run, saving time
- Fix all ESLint errors before proceeding

### Testing Integration

#### API Testing in CI/CD

For adapters with external API dependencies:

```yaml
demo-api-tests:
  if: contains(github.event.head_commit.message, '[skip ci]') == false
  runs-on: ubuntu-22.04
  
  steps:
    - name: Checkout code
      uses: actions/checkout@v4
      
    - name: Use Node.js 20.x
      uses: actions/setup-node@v4
      with:
        node-version: 20.x
        cache: 'npm'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Run demo API tests
      run: npm run test:integration-demo
```

#### Testing Best Practices
- Run credential tests separately from main test suite
- Don't make credential tests required for deployment
- Provide clear failure messages for API issues
- Use appropriate timeouts for external calls (120+ seconds)

#### Package.json Integration
```json
{
  "scripts": {
    "test:integration-demo": "mocha test/integration-demo --exit"
  }
}
```

---

## TR-064 Adapter Specific Patterns

### State Management

- Use `this.setState()` with proper acknowledgment flags
- Always check for `this.config` before accessing configuration
- Implement proper error handling for state operations
- Use semantic state names following ioBroker conventions

**TR-064 State Examples:**
```javascript
// Connection status
await this.setState('info.connection', true, true);

// Device states
await this.setState('states.wlan', wlanStatus, true);
await this.setState('states.wlan5', wlan5Status, true);

// Call monitoring
await this.setState('callmonitor.ring', isRinging, true);
await this.setState('callmonitor.caller', callerNumber, true);

// Device presence
await this.setState(`devices.${deviceName}.active`, isActive, true);
```

### Configuration Handling
```javascript
// TR-064 configuration access patterns
const fritzBoxIP = this.config.iporhost || 'fritz.box';
const username = this.config.user || '';
const password = this.decrypt(this.config.password);
const pollingInterval = this.config.pollingInterval * 1000;
```

### Logging
Use appropriate logging levels following ioBroker standards:
```javascript
this.log.error('Connection to Fritz!Box failed');
this.log.warn('Call monitoring disabled - dial #96*5* to enable');
this.log.info('Fritz!Box connection established');
this.log.debug('Processing TR-064 service response');
```

### Adapter Lifecycle
```javascript
async onReady() {
  // Initialize TR-064 connection
  await this.initializeFritzBoxConnection();
  
  // Start call monitor if enabled
  if (this.config.useCallMonitor) {
    await this.startCallMonitor();
  }
}

onUnload(callback) {
  try {
    // Clean up TR-064 connections
    if (this.callMonitorSocket) {
      this.callMonitorSocket.destroy();
    }
    
    // Clear timers
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
    }
    
    callback();
  } catch (e) {
    callback();
  }
}
```

### Phone Number Formatting
```javascript
// Phone number formatting for TR-064
formatPhoneNumber(number) {
    if (!number) return '';
    
    // Remove special TR-064 prefixes
    return number.replace(/^\*\*610/, '').replace(/^0049/, '+49');
}
```