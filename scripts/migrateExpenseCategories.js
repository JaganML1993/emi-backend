/**
 * One-time migration: normalize every expense.category to the fixed canonical list.
 * Run AFTER deploying normalizeExpenseCategory + enum (or run before enum deploy — then schema validates).
 *
 * Usage: node scripts/migrateExpenseCategories.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Expense = require('../models/Expense');
const { normalizeExpenseCategory } = require('../constants/expenseCategories');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGODB_URL);
  console.log('Connected');

  const cursor = Expense.find({}).cursor();
  let updated = 0;
  let skipped = 0;

  for await (const doc of cursor) {
    const next = normalizeExpenseCategory(doc.category);
    if (doc.category === next) {
      skipped += 1;
      continue;
    }
    await Expense.updateOne({ _id: doc._id }, { $set: { category: next } });
    updated += 1;
    console.log(`  ${doc._id}: "${doc.category}" → "${next}"`);
  }

  console.log(`\nDone. Updated: ${updated}, unchanged: ${skipped}`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
