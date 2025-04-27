import twilio from 'twilio';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      throw new Error('Twilio credentials not configured');
    }

    const client = twilio(accountSid, authToken);
    const token = await client.tokens.create();

    // Return only the ICE servers configuration
    return res.status(200).json({ 
      iceServers: token.iceServers
    });
  } catch (error) {
    console.error('Error fetching Twilio token:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch TURN credentials',
      details: error.message 
    });
  }
} 