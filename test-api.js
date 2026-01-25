/**
 * Test Backend API Response
 */
const axios = require('axios');

async function testBackendAPI() {
  try {
    const articleId = 'nyt://article/a837b209-0d08-5f4c-b38d-e459939a6c23';
    const url = `http://localhost:3001/api/articles/${encodeURIComponent(articleId)}?ai=true`;
    
    console.log('🔍 Testing backend API...');
    console.log(`URL: ${url}\n`);
    
    const response = await axios.get(url);
    const article = response.data;
    
    console.log('📋 Article Title:', article.title);
    console.log('💬 Has AI Commentary:', !!article.aiCommentary);
    console.log('📋 Commentary Queued:', !!article._commentaryQueued);
    
    if (article.aiCommentary) {
      console.log('\n━'.repeat(80));
      console.log('AI COMMENTARY:');
      console.log('━'.repeat(80));
      console.log(article.aiCommentary);
      console.log('━'.repeat(80));
      
      // Check sections
      const hasKeyPoints = article.aiCommentary.includes('Key Points');
      const hasImpactAnalysis = article.aiCommentary.includes('Impact Analysis');
      const hasFutureOutlook = article.aiCommentary.includes('Future Outlook');
      
      console.log('\n📊 Section Check:');
      console.log(`  ${hasKeyPoints ? '✅' : '❌'} Key Points`);
      console.log(`  ${hasImpactAnalysis ? '✅' : '❌'} Impact Analysis`);
      console.log(`  ${hasFutureOutlook ? '✅' : '❌'} Future Outlook`);
    } else {
      console.log('\n❌ No commentary in response!');
      console.log('Response keys:', Object.keys(article));
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
  }
}

testBackendAPI();
