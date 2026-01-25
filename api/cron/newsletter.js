// Newsletter cron endpoint for Vercel
const NewsletterScheduler = require('../../services/NewsletterScheduler');
const { connectToMongoDB } = require('../../config/database');

module.exports = async (req, res) => {
  console.log('🔔 Newsletter cron endpoint triggered at:', new Date().toISOString());
  
  // Only allow GET requests from Vercel cron
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Ensure database connection
    await connectToMongoDB();
    console.log('📡 Database connected for newsletter cron');
    
    // Trigger newsletter sending
    console.log('📬 Starting newsletter send from cron...');
    const result = await NewsletterScheduler.sendHourlyNewsletters();
    
    console.log('✅ Newsletter cron completed:', {
      success: result.success,
      message: result.message,
      results: result.results,
      historyId: result.historyId
    });
    
    return res.status(200).json({
      success: true,
      message: 'Newsletter cron executed successfully',
      timestamp: new Date().toISOString(),
      result: result
    });
    
  } catch (error) {
    console.error('❌ Newsletter cron error:', error);
    
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};
