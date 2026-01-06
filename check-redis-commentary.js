const cacheService = require('./services/cache');

(async () => {
  try {
    const articleId = '695c1cf0d9c013c4a2997e6c';
    const key = `commentary:${articleId}`;
    
    console.log(`\n🔍 Checking Redis for key: ${key}`);
    
    const value = await cacheService.get(key);
    
    if (value) {
      console.log('✅ Commentary EXISTS in Redis');
      console.log(`📏 Length: ${value.length} characters`);
      console.log('\n📝 First 300 characters:');
      console.log(value.substring(0, 300));
      console.log('\n...');
      
      // Check if it has all 3 sections
      const sections = ['Key Points', 'Impact Analysis', 'Future Outlook'];
      console.log('\n🔍 Section check:');
      sections.forEach(section => {
        const has = value.includes(section);
        console.log(`  ${has ? '✅' : '❌'} ${section}`);
      });
    } else {
      console.log('❌ Commentary NOT FOUND in Redis');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
})();
