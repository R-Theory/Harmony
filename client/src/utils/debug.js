class DebugLogger {
  constructor(moduleName) {
    this.moduleName = moduleName;
    this.isEnabled = process.env.NODE_ENV !== 'production';
  }

  log(message, data = null) {
    if (this.isEnabled) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [${this.moduleName}] ${message}`, data || '');
    }
  }

  logError(error, context = '') {
    if (this.isEnabled) {
      const timestamp = new Date().toISOString();
      console.error(`[${timestamp}] [${this.moduleName}] ${context}:`, error);
    }
  }

  logApiCall(url, method) {
    if (this.isEnabled) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [${this.moduleName}] API Call: ${method} ${url}`);
    }
  }
}

export default DebugLogger; 