/**
 * Custom error class that wraps AWS SDK errors
 */
export class AWSError extends Error {
  constructor(
    message: string,
    public readonly serviceName: string,
    public readonly operation: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'AWSError';
  }
}

/**
 * Custom error class that wraps AWS API throttling errors
 */
export class AWSThrottlingError extends AWSError {
  constructor(
    message: string,
    serviceName: string,
    operation: string,
    originalError?: Error
  ) {
    super(message, serviceName, operation, originalError);
    this.name = 'AWSThrottlingError';
  }
}

/**
 * Custom error class that wraps Bedrock API throttling errors
 */
export class BedrockThrottlingError extends AWSThrottlingError {
  constructor(
    message: string,
    operation: string,
    originalError?: Error
  ) {
    super(message, 'Bedrock', operation, originalError);
    this.name = 'BedrockThrottlingError';
  }
}
