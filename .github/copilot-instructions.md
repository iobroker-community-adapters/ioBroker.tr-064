# ioBroker Adapter Development with GitHub Copilot

**Version:** 0.4.0
**Template Source:** https://github.com/DrozmotiX/ioBroker-Copilot-Instructions

This file contains instructions and best practices for GitHub Copilot when working on ioBroker adapter development.

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

## Testing

### Unit Testing
- Use Jest as the primary testing framework for ioBroker adapters
- Create tests for all adapter main functions and helper methods
- Test error handling scenarios and edge cases
- Mock external API calls and hardware dependencies
- For adapters connecting to APIs/devices not reachable by internet, provide example data files to allow testing of functionality without live connections
- Example test structure:
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

**IMPORTANT**: Use the official `@iobroker/testing` framework for all integration tests. This is the ONLY correct way to test ioBroker adapters.

**Official Documentation**: https://github.com/ioBroker/testing

#### Framework Structure
Integration tests MUST follow this exact pattern:

```javascript
const path = require('path');
const { tests } = require('@iobroker/testing');

// Define test coordinates or configuration
const TEST_COORDINATES = '52.520008,13.404954'; // Berlin
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Use tests.integration() with defineAdditionalTests
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
                        harness = getHarness();
                        
                        // Get adapter object using promisified pattern
                        const obj = await new Promise((res, rej) => {
                            harness.objects.getObject('system.adapter.your-adapter.0', (err, o) => {
                                if (err) return rej(err);
                                res(o);
                            });
                        });
                        
                        if (!obj) {
                            return reject(new Error('Adapter object not found'));
                        }

                        // Configure adapter properties
                        Object.assign(obj.native, {
                            position: TEST_COORDINATES,
                            createCurrently: true,
                            createHourly: true,
                            createDaily: true,
                            // Add other configuration as needed
                        });

                        // Set the updated configuration
                        harness.objects.setObject(obj._id, obj);

                        console.log('✅ Step 1: Configuration written, starting adapter...');
                        
                        // Start adapter and wait
                        await harness.startAdapterAndWait();
                        
                        console.log('✅ Step 2: Adapter started');

                        // Wait for adapter to process data
                        const waitMs = 15000;
                        await wait(waitMs);

                        console.log('🔍 Step 3: Checking states after adapter run...');
                        
                        // Check that adapter created expected states
                        const connectionState = await harness.states.getStateAsync('your-adapter.0.info.connection');
                        
                        if (connectionState) {
                            console.log('✅ Connection state found:', connectionState.val);
                        }

                        resolve();
                    } catch (e) {
                        console.log('❌ Test error:', e.message);
                        reject(e);
                    }
                });
            });
        });
    }
});
```

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
    }
});
```

#### Advanced Testing with Multiple Scenarios
```javascript
// Test multiple Fritz!Box configurations
const testConfigs = [
    { name: 'Basic Connection', useCallMonitor: false, usePhonebook: false },
    { name: 'Full Features', useCallMonitor: true, usePhonebook: true }
];

testConfigs.forEach(config => {
    suite(`TR-064 ${config.name} Test`, (getHarness) => {
        it(`should work with ${config.name.toLowerCase()} configuration`, function() {
            // Test implementation
        });
    });
});
```

#### Error Scenario Testing
```javascript
suite('TR-064 Error Handling', (getHarness) => {
    it('should handle invalid Fritz!Box credentials gracefully', async function() {
        const harness = getHarness();
        
        // Configure with invalid credentials
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
```

## ioBroker Adapter Patterns

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

## Code Style and Standards

- Follow JavaScript/TypeScript best practices
- Use async/await for asynchronous operations
- Implement proper resource cleanup in `unload()` method
- Use semantic versioning for adapter releases
- Include proper JSDoc comments for public methods

**TR-064 Specific Patterns:**
```javascript
// TR-064 service call pattern
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

// Phone number formatting for TR-064
formatPhoneNumber(number) {
    if (!number) return '';
    
    // Remove special TR-064 prefixes
    return number.replace(/^\*\*610/, '').replace(/^0049/, '+49');
}

// Device presence checking
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

## CI/CD and Testing Integration

### GitHub Actions for API Testing
For adapters with external API dependencies, implement separate CI/CD jobs:

```yaml
# Tests API connectivity with demo credentials (runs separately)
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

### CI/CD Best Practices
- Run credential tests separately from main test suite
- Use ubuntu-22.04 for consistency
- Don't make credential tests required for deployment
- Provide clear failure messages for API connectivity issues
- Use appropriate timeouts for external API calls (120+ seconds)

### Package.json Script Integration
Add dedicated script for credential testing:
```json
{
  "scripts": {
    "test:integration-demo": "mocha test/integration-demo --exit"
  }
}
```

### Practical Example: Complete API Testing Implementation
Here's a complete example based on lessons learned from the Discovergy adapter:

#### test/integration-demo.js
```javascript
const path = require("path");
const { tests } = require("@iobroker/testing");

// Helper function to encrypt password using ioBroker's encryption method
async function encryptPassword(harness, password) {
    const systemConfig = await harness.objects.getObjectAsync("system.config");
    
    if (!systemConfig || !systemConfig.native || !systemConfig.native.secret) {
        throw new Error("Could not retrieve system secret for password encryption");
    }
    
    const secret = systemConfig.native.secret;
    let result = '';
    for (let i = 0; i < password.length; ++i) {
        result += String.fromCharCode(secret[i % secret.length].charCodeAt(0) ^ password.charCodeAt(i));
    }
    
    return result;
}

// Run integration tests with demo credentials
tests.integration(path.join(__dirname, ".."), {
    defineAdditionalTests({ suite }) {
        suite("API Testing with Demo Credentials", (getHarness) => {
            let harness;
            
            before(() => {
                harness = getHarness();
            });

            it("Should connect to API and initialize with demo credentials", async () => {
                console.log("Setting up demo credentials...");
                
                if (harness.isAdapterRunning()) {
                    await harness.stopAdapter();
                }
                
                const encryptedPassword = await encryptPassword(harness, "demo_password");
                
                await harness.changeAdapterConfig("your-adapter", {
                    native: {
                        username: "demo@provider.com",
                        password: encryptedPassword,
                        // other config options
                    }
                });

                console.log("Starting adapter with demo credentials...");
                await harness.startAdapter();
                
                // Wait for API calls and initialization
                await new Promise(resolve => setTimeout(resolve, 60000));
                
                const connectionState = await harness.states.getStateAsync("your-adapter.0.info.connection");
                
                if (connectionState && connectionState.val === true) {
                    console.log("✅ SUCCESS: API connection established");
                    return true;
                } else {
                    throw new Error("API Test Failed: Expected API connection to be established with demo credentials. " +
                        "Check logs above for specific API errors (DNS resolution, 401 Unauthorized, network issues, etc.)");
                }
            }).timeout(120000);
        });
    }
});
```

**TR-064 Demo Testing Pattern:**
```javascript
// TR-064 adapter demo testing with Fritz!Box simulator
tests.integration(path.join(__dirname, ".."), {
    defineAdditionalTests({ suite }) {
        suite("Fritz!Box Demo Connection", (getHarnes) => {
            it("Should simulate Fritz!Box connection for CI testing", async () => {
                // Use mock Fritz!Box responses for CI testing
                const mockResponses = require('./fixtures/fritzbox-responses.json');
                
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