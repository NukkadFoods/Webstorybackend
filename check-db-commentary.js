require('dotenv').config();
const mongoose = require('mongoose');

async function checkDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    
    const Article = require('./models/article');
    
    // Total articles
    const total = await Article.countDocuments();
    console.log('📊 Total Articles:', total);
    
    // Articles WITH commentary
    const withCommentary = await Article.countDocuments({
      aiCommentary: { $exists: true, $ne: null, $ne: '' }
    });
    console.log('✅ Articles WITH Commentary:', withCommentary);
    
    // Articles WITHOUT commentary
    const withoutCommentary = total - withCommentary;
    console.log('❌ Articles WITHOUT Commentary:', withoutCommentary);
    console.log('');
    
    // By section WITH commentary
    console.log('📂 Articles WITH Commentary by Section:');
    const bySection = await Article.aggregate([
      { $match: { aiCommentary: { $exists: true, $ne: null, $ne: '' } } },
      { $group: { _id: '$section', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    bySection.forEach(s => console.log(`   ${s._id}: ${s.count}`));
    
    console.log('');
    console.log('📂 Articles WITHOUT Commentary by Section:');
    const withoutBySection = await Article.aggregate([
      { $match: { 
        $or: [
          { aiCommentary: { $exists: false } },
          { aiCommentary: null },
          { aiCommentary: '' }
        ]
      }},
      { $group: { _id: '$section', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    withoutBySection.forEach(s => console.log(`   ${s._id}: ${s.count}`));
    
    console.log('');
    console.log('📝 Sample Articles WITH Commentary:');
    const samples = await Article.find({
      aiCommentary: { $exists: true, $ne: null, $ne: '' }
    }).limit(3).select('title section aiCommentary');
    
    samples.forEach((article, i) => {
      console.log(`\n${i+1}. ${article.title.substring(0, 60)}...`);
      console.log(`   Section: ${article.section}`);
      console.log(`   Commentary: ${article.aiCommentary.substring(0, 100)}...`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

checkDB();
