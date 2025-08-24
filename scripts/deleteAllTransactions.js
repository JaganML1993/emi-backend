const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
require('dotenv').config();

// Configuration - Modify these variables as needed
const USER_ID = null; // Set to specific user ID to delete only that user's transactions, or null to delete all
const CONFIRM_DELETION = true; // Set to true to actually perform deletion

async function deleteAllTransactions() {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('Connected to MongoDB');

    // Build query based on configuration
    let query = {};
    if (USER_ID) {
      query.user = USER_ID;
      console.log(`🗑️ Preparing to delete all transactions for user: ${USER_ID}`);
    } else {
      console.log('🗑️ Preparing to delete ALL transactions from the database');
    }

    // Find all transactions matching the query
    const transactions = await Transaction.find(query).sort({ date: 1 });

    if (transactions.length === 0) {
      console.log('✅ No transactions found to delete.');
      process.exit(0);
    }

    console.log(`\n📋 Found ${transactions.length} transactions to delete:`);
    
    // Show summary of transactions
    let totalIncome = 0;
    let totalExpense = 0;
    
    transactions.forEach((tx, index) => {
      const date = new Date(tx.date);
      const amount = tx.amount;
      
      if (tx.type === 'income') {
        totalIncome += amount;
      } else {
        totalExpense += amount;
      }
      
      console.log(`${index + 1}. ${date.toLocaleDateString()} - ${tx.type.toUpperCase()} - ₹${amount.toLocaleString()} - ${tx.description}`);
    });

    console.log(`\n📊 Summary:`);
    console.log(`   Total Income: ₹${totalIncome.toLocaleString()}`);
    console.log(`   Total Expense: ₹${totalExpense.toLocaleString()}`);
    console.log(`   Net: ₹${(totalIncome - totalExpense).toLocaleString()}`);

    // Safety check
    if (!CONFIRM_DELETION) {
      console.log(`\n⚠️  SAFETY CHECK: CONFIRM_DELETION is set to false`);
      console.log(`   To actually delete transactions, set CONFIRM_DELETION = true in the script`);
      console.log(`   This prevents accidental deletion of all data`);
      process.exit(0);
    }

    // Final confirmation
    console.log(`\n⚠️  WARNING: You are about to delete ${transactions.length} transactions!`);
    console.log(`   This action cannot be undone.`);
    console.log(`   Make sure you have a backup if needed.`);
    
    // Add a small delay to give user time to read
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Delete all transactions
    console.log(`\n🗑️ Deleting all ${transactions.length} transactions...`);
    
    let deletedCount = 0;
    for (const tx of transactions) {
      await Transaction.findByIdAndDelete(tx._id);
      deletedCount++;
      
      if (deletedCount % 100 === 0 || deletedCount === transactions.length) {
        console.log(`   Progress: ${deletedCount}/${transactions.length} transactions deleted`);
      }
    }

    console.log(`\n🎉 Successfully deleted all ${deletedCount} transactions!`);
    
    if (USER_ID) {
      console.log(`All transaction records for user ${USER_ID} have been removed from the database.`);
    } else {
      console.log(`All transaction records have been removed from the database.`);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error deleting transactions:', error);
    process.exit(1);
  }
}

// Run the script
deleteAllTransactions();
