export type UsersInViolation = Record<string, number[]>;

export interface TargetAccountDetail {
  /**
   * Account ID
   */
  id: string;
  /**
   * Account Name
   */
  name: string;
  /**
   * Users and the keys that violate the age limit
   */
  users?: UsersInViolation | undefined;
  /**
   * Errors that may have been raised by Lambda
   */
  error?: string[];
}

export interface ClientCredentials {
  /**
   * Access Key ID
   */
  accessKeyId: string;
  /**
   * Secret Access Key ID
   */
  secretAccessKey: string;
  /**
   * Session Token
   */
  sessionToken: string;
}
