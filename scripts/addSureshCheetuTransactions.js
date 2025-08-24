const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const EMI = require('../models/EMI');
const Category = require('../models/Category');
require('dotenv').config();

// Configuration
const EMI_ID = '68aaf68456508e03c88eb7f3';
const USER_ID = '68a9fa309f4cc06312f240b9';
const MONTHLY_AMOUNT = 16000;
const START_DATE = '2024-08-25';

async function addSureshCheetuTransactions() {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('Connected to MongoDB');

    // Find the EMI
    const emi = await EMI.findById(EMI_ID);
    if (!emi) {
      console.log('❌ EMI not found');
      process.exit(1);
    }

    console.log(`\n💰 Found EMI: ${emi.name}`);
    console.log(`   Type: ${emi.type}`);
    console.log(`   Monthly Amount: ₹${emi.emiAmount.toLocaleString()}`);
    console.log(`   Total Installments: ${emi.totalInstallments}`);
    console.log(`   Current Paid Installments: ${emi.paidInstallments}`);

    // Find or create a savings category
    let savingsCategory = await Category.findOne({
      user: USER_ID,
      name: { $regex: /savings/i }
    });

    if (!savingsCategory) {
      // Create a new savings category
      savingsCategory = await Category.create({
        user: USER_ID,
        name: 'Savings',
        type: 'income',
        color: '#00d25b',
        icon: 'tim-icons icon-money-coins',
        isDefault: false
      });
      console.log(`\n✅ Created new category: ${savingsCategory.name} (${savingsCategory._id})`);
    } else {
      console.log(`\n✅ Using existing category: ${savingsCategory.name} (${savingsCategory._id})`);
    }

    // Calculate installments from August 25, 2024 to last month (July 2025)
    const startDate = new Date(START_DATE);
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1); // Go to last month
    
    // Generate monthly dates from August 25, 2024 to last month
    const installments = [];
    let currentInstallmentDate = new Date(startDate);
    
    while (currentInstallmentDate <= lastMonth) {
      installments.push(new Date(currentInstallmentDate));
      currentInstallmentDate.setMonth(currentInstallmentDate.getMonth() + 1);
    }

    console.log(`\n📅 Will add ${installments.length} installments from ${startDate.toLocaleDateString()} to ${lastMonth.toLocaleDateString()}`);

    // Check if transactions already exist for these dates
    const existingTransactions = await Transaction.find({
      user: USER_ID,
      description: { $regex: /Suresh Cheetu Krishnagiri.*installment/i },
      date: { $gte: startDate, $lte: lastMonth }
    });

    if (existingTransactions.length > 0) {
      console.log(`\n⚠️  Found ${existingTransactions.length} existing transactions for this period:`);
      existingTransactions.forEach(tx => {
        console.log(`   ${new Date(tx.date).toLocaleDateString()} - ₹${tx.amount} - ${tx.description}`);
      });
      
      const proceed = await askConfirmation('Do you want to proceed and add missing installments? (y/n): ');
      if (!proceed) {
        console.log('Operation cancelled');
        process.exit(0);
      }
    }

    // Add transactions for each installment
    let addedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < installments.length; i++) {
      const installmentDate = installments[i];
      const installmentNumber = i + 1;
      
      // Check if transaction already exists for this date
      const existingTx = await Transaction.findOne({
        user: USER_ID,
        description: { $regex: new RegExp(`Suresh Cheetu Krishnagiri.*installment.*${installmentNumber}`, 'i') },
        date: installmentDate
      });

      if (existingTx) {
        console.log(`   ⏭️  Skipped installment ${installmentNumber} (${installmentDate.toLocaleDateString()}) - already exists`);
        skippedCount++;
        continue;
      }

      // Create transaction
      const transaction = await Transaction.create({
        user: USER_ID,
        type: 'income', // Savings EMIs are recorded as income
        amount: MONTHLY_AMOUNT,
        description: `Suresh Cheetu Krishnagiri - Installment ${installmentNumber}`,
        category: savingsCategory._id, // Use the category ObjectId
        date: installmentDate,
        notes: `Monthly savings contribution for ${emi.name}`
      });

      console.log(`   ✅ Added installment ${installmentNumber} (${installmentDate.toLocaleDateString()}) - ₹${MONTHLY_AMOUNT.toLocaleString()}`);
      addedCount++;
    }

    // Update EMI paid installments
    const totalPaid = emi.paidInstallments + addedCount;
    await EMI.findByIdAndUpdate(EMI_ID, {
      paidInstallments: totalPaid,
      remainingAmount: (emi.emiAmount * emi.totalInstallments) - (totalPaid * emi.emiAmount)
    });

    console.log(`\n🎉 Summary:`);
    console.log(`   Added: ${addedCount} transactions`);
    console.log(`   Skipped: ${skippedCount} transactions (already existed)`);
    console.log(`   Total paid installments: ${totalPaid}/${emi.totalInstallments}`);
    console.log(`   Remaining amount: ₹${((emi.emiAmount * emi.totalInstallments) - (totalPaid * emi.emiAmount)).toLocaleString()}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error adding transactions:', error);
    process.exit(1);
  }
}

// Helper function to ask for confirmation
function askConfirmation(question) {
  return new Promise((resolve) => {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

// Run the script
addSureshCheetuTransactions();
