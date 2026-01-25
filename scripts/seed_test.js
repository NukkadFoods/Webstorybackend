const mongoose = require('mongoose');
const Article = require('../models/article');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function seed() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        const testArticle = new Article({
            title: "AI Anchor Test Article",
            section: "technology",
            url: "ai-anchor-test-article",
            abstract: "This is a test article to verify the AI News Anchor functionality. It includes a headline, abstract, and AI commentary.",
            aiCommentary: "## Key Points\n\n*   The system is working.\n*   Audio generation is functional.\n*   The frontend player should be visible.\n\n## Impact Analysis\n\nUsers can now listen to news updates.\n\n## Future Outlook\n\nWe will expand this to all sections.",
            published_date: new Date(),
            source: "Test System"
        });

        await testArticle.save();
        console.log('Test article saved with ID:', testArticle._id);
        console.log('Test article URL:', testArticle.url);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

seed();
