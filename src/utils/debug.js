const DEBUG = true; // Set to false in production

class DebugLogger {
  constructor(module) {
    this.module = module;
    this.enabled = process.env.NODE_ENV === 'development';
    this.logHistory = [];
    this.maxHistoryLength = 100;
  }

  formatMessage(level, message, data) {
    const timestamp = new Date().toISOString();
    const formattedData = data ? `\n${JSON.stringify(data, null, 2)}` : '';
    return `[${timestamp}][${level}][${this.module}] ${message}${formattedData}`;
  }

  addToHistory(level, message, data) {
    this.logHistory.push({
      timestamp: new Date(),
      level,
      message,
      data
    });

    // Keep history at a reasonable size
    if (this.logHistory.length > this.maxHistoryLength) {
      this.logHistory.shift();
    }
  }

  log(message, data) {
    if (!this.enabled) return;
    
    const formattedMessage = this.formatMessage('INFO', message, data);
    console.log(formattedMessage);
    this.addToHistory('INFO', message, data);
  }

  error(message, error) {
    if (!this.enabled) return;
    
    const errorData = error ? {
      message: error.message,
      stack: error.stack,
      ...error
    } : null;
    
    const formattedMessage = this.formatMessage('ERROR', message, errorData);
    console.error(formattedMessage);
    this.addToHistory('ERROR', message, errorData);
  }

  warn(message, data) {
    if (!this.enabled) return;
    
    const formattedMessage = this.formatMessage('WARN', message, data);
    console.warn(formattedMessage);
    this.addToHistory('WARN', message, data);
  }

  debug(message, data) {
    if (!this.enabled) return;
    
    const formattedMessage = this.formatMessage('DEBUG', message, data);
    console.debug(formattedMessage);
    this.addToHistory('DEBUG', message, data);
  }

  getHistory() {
    return this.logHistory;
  }

  clearHistory() {
    this.logHistory = [];
  }
}

export default DebugLogger; 