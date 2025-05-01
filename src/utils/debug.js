const DEBUG = true; // Set to false in production

class DebugLogger {
  constructor(component) {
    this.component = component;
    this.lastCall = {};
  }

  log(message, data = null) {
    if (!DEBUG) return;
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${this.component}] ${message}`, data || '');
  }

  logApiCall(endpoint, method) {
    if (!DEBUG) return;
    const now = Date.now();
    const lastCall = this.lastCall[endpoint] || 0;
    const timeSinceLastCall = now - lastCall;
    this.lastCall[endpoint] = now;
    
    this.log(`API Call: ${method} ${endpoint}`, {
      timeSinceLastCall,
      timestamp: new Date().toISOString()
    });
  }

  logStateChange(prevState, newState) {
    if (!DEBUG) return;
    this.log('State Change:', {
      from: prevState,
      to: newState
    });
  }

  logError(error, context = '') {
    if (!DEBUG) return;
    console.error(`[${this.component}] Error${context ? ` in ${context}` : ''}:`, error);
  }
}

export default DebugLogger; 