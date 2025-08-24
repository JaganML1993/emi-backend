const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const EMI = require('../models/EMI');
const Category = require('../models/Category');
require('dotenv').config();

// Configuration
const EMI_ID = '68aaf1e55006458570f90823';
const USER_ID = '68a9fa309f4cc06312f240b9';
const MONTHLY_AMOUNT = 3000;
const START_DATE = '2025-04-17';

async function addSangamKrishnagiriTransactions() {
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

    // Find or create a personal loan category
    let loanCategory = await Category.findOne({
      user: USER_ID,
      name: { $regex: /personal.*loan/i }
    });

    if (!loanCategory) {
      // Create a new personal loan category
      loanCategory = await Category.create({
        user: USER_ID,
        name: 'Personal Loan',
        type: 'expense',
        color: '#fd5d93',
        icon: 'tim-icons icon-money-coins',
        isDefault: false
      });
      console.log(`\n✅ Created new category: ${loanCategory.name} (${loanCategory._id})`);
    } else {
      console.log(`\n✅ Using existing category: ${loanCategory.name} (${loanCategory._id})`);
    }

    // Calculate installments from April 17, 2025 to current month
    const startDate = new Date(START_DATE);
    const currentDate = new Date();
    
    // Generate monthly dates from April 17, 2025
    const installments = [];
    let currentInstallmentDate = new Date(startDate);
    
    while (currentInstallmentDate <= currentDate) {
      installments.push(new Date(currentInstallmentDate));
      currentInstallmentDate.setMonth(currentInstallmentDate.getMonth() + 1);
    }

    console.log(`\n📅 Will add ${installments.length} installments from ${startDate.toLocaleDateString()} to ${currentDate.toLocaleDateString()}`);

    // Check if transactions already exist for these dates
    const existingTransactions = await Transaction.find({
      user: USER_ID,
      description: { $regex: /Sangam Krishnagiri.*installment/i },
      date: { $gte: startDate, $lte: currentDate }
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
        description: { $regex: new RegExp(`Sangam Krishnagiri.*installment.*${installmentNumber}`, 'i') },
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
        type: 'expense', // Personal loans are recorded as expenses
        amount: MONTHLY_AMOUNT,
        description: `Sangam Krishnagiri - Installment ${installmentNumber}`,
        category: loanCategory._id, // Use the category ObjectId
        date: installmentDate,
        notes: `Monthly loan payment for ${emi.name}`
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
addSangamKrishnagiriTransactions();
