export class IntellistayClient {
  private static instance: IntellistayClient;
  private baseUrl: string;
  private username: string;
  private password: string;
  
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiresAt: number | null = null; // Store epoch ms

  private constructor() {
    this.baseUrl = process.env.INTELLISTAY_API_URL || 'https://ritumbharatest.aastratech.com';
    this.username = process.env.INTELLISTAY_USERNAME || 'hms';
    this.password = process.env.INTELLISTAY_PASSWORD || '1234';
  }

  public static getInstance(): IntellistayClient {
    if (!IntellistayClient.instance) {
      IntellistayClient.instance = new IntellistayClient();
    }
    return IntellistayClient.instance;
  }

  /**
   * Authenticate with the Intellistay API and retrieve tokens
   */
  public async authenticate(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/Login/Login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          userIdentifier: this.username,
          password: this.password,
          channelId: 1
        })
      });

      if (!response.ok) {
        console.error(`Intellistay Auth Failed: ${response.status} ${response.statusText}`);
        const errorText = await response.text();
        console.error(`Error details: ${errorText}`);
        return false;
      }

      const data = await response.json();
      
      this.accessToken = data.accessToken;
      this.refreshToken = data.refreshToken;
      
      // Assuming token is valid for 1 hour (3600000 ms) if not provided by API
      // Subtracting 5 minutes (300000 ms) for safety buffer
      this.tokenExpiresAt = Date.now() + 3600000 - 300000;
      
      console.log('Successfully authenticated with Intellistay.');
      return true;
    } catch (error) {
      console.error('Intellistay Auth Exception:', error);
      return false;
    }
  }

  /**
   * Ensures a valid token exists before making requests
   */
  public async ensureAuthenticated(): Promise<boolean> {
    if (!this.accessToken || !this.tokenExpiresAt || Date.now() > this.tokenExpiresAt) {
      console.log('Token missing or expired. Authenticating...');
      return await this.authenticate();
    }
    return true;
  }

  /**
   * Get the current Access Token
   */
  public async getAccessToken(): Promise<string | null> {
    const isAuthenticated = await this.ensureAuthenticated();
    if (!isAuthenticated) return null;
    return this.accessToken;
  }

  /**
   * Make an authenticated request to the Intellistay API
   */
  public async fetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const token = await this.getAccessToken();
    if (!token) {
      throw new Error("Unable to authenticate with Intellistay");
    }

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers || {})
    };

    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;

    return fetch(url, {
      ...options,
      headers
    });
  }
}

// Export a ready-to-use singleton instance
export const intellistay = IntellistayClient.getInstance();
