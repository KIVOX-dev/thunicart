// Adds the policy pages (privacy, terms, refunds and returns, shipping, cookies) to the website content, so they can be edited in
// Online store, Content. A page is only added when its slug is missing: a page someone already wrote or edited is never touched.
// The text lives in shared/src/content/policies.json, the same file the website uses as its built in fallback.
const pages = require('../../shared/src/content/policies.json');

module.exports = {
  async up(db) {
    const col = db.collection('cms_pages');
    const now = new Date();
    for (const p of pages) {
      if (await col.findOne({ slug: p.slug })) continue;
      await col.insertOne({ slug: p.slug, title: p.title, body: p.body, seoTitle: p.seoTitle, seoDescription: p.seoDescription, active: true, createdAt: now, updatedAt: now, version: 0 });
    }
  },
  // Pages may have been edited since, so nothing is removed.
  async down() {},
};
