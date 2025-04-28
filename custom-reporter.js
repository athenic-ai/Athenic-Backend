// custom-reporter.js
class CustomReporter {
  constructor(globalConfig, options) {
    this._globalConfig = globalConfig;
    this._options = options;
  }

  onRunStart(results, options) {
    console.log('=== TEST RUN STARTED ===');
  }

  onTestStart(test) {
    console.log(`Starting test: ${test.path}`);
  }

  onTestResult(test, testResult, aggregatedResult) {
    console.log(`Test: ${test.path}`);
    console.log(`Status: ${testResult.numFailingTests === 0 ? 'PASSED' : 'FAILED'}`);
    console.log(`Results: ${testResult.numPassingTests} passed, ${testResult.numFailingTests} failed, ${testResult.numPendingTests} pending`);
    
    testResult.testResults.forEach(result => {
      console.log(`- ${result.title}: ${result.status.toUpperCase()}`);
      if (result.status === 'failed') {
        console.log(`  Error: ${result.failureMessages.join('\n')}`);
      }
    });
    
    console.log('---\n');
  }

  onRunComplete(contexts, results) {
    console.log('=== TEST RUN COMPLETED ===');
    console.log(`Results: ${results.numPassedTests} passed, ${results.numFailedTests} failed, ${results.numPendingTests} pending`);
    
    if (results.numFailedTests > 0) {
      console.log('\nFailed Tests:');
      results.testResults.forEach(testResult => {
        testResult.testResults.forEach(result => {
          if (result.status === 'failed') {
            console.log(`- ${result.fullName}`);
          }
        });
      });
    }
  }
}

module.exports = CustomReporter; 