# EMI Tracking Backend API

A robust Node.js/Express backend API for tracking EMI loans, transactions, and financial reports.

## 🚀 Live Demo

**API Base URL**: https://emi-backend-wodb.onrender.com

## ✨ Features

- **User Authentication**: JWT-based authentication system
- **EMI Management**: Create, read, update, and delete EMI records
- **Transaction Tracking**: Comprehensive transaction management
- **Financial Reports**: Generate detailed financial reports
- **RESTful API**: Clean and intuitive API endpoints
- **Security**: Helmet.js, CORS, input validation
- **Database**: MongoDB with Mongoose ODM

## 🛠️ Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB
- **ODM**: Mongoose
- **Authentication**: JWT
- **Security**: Helmet.js, CORS
- **Validation**: Express-validator
- **Logging**: Morgan

## 📋 Prerequisites

- Node.js (v16 or higher)
- MongoDB Atlas account
- npm or yarn package manager

## 🚀 Quick Start

### 1. Clone the repository
```bash
git clone https://github.com/JaganML1993/emi-backend.git
cd emi-backend
```

### 2. Install dependencies
```bash
npm install
```

### 3. Environment Setup
Copy `env.example` to `.env` and configure your variables:
```bash
cp env.example .env
```

### 4. Configure Environment Variables
```env
MONGODB_URL=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
NODE_ENV=development
PORT=5000
```

### 5. Run the application
```bash
# Development
npm run dev

# Production
npm start
```

## 📚 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/profile` - Get user profile

### EMIs
- `GET /api/emis` - Get all EMIs
- `POST /api/emis` - Create new EMI
- `PUT /api/emis/:id` - Update EMI
- `DELETE /api/emis/:id` - Delete EMI

### Transactions
- `GET /api/transactions` - Get all transactions
- `POST /api/transactions` - Create transaction
- `PUT /api/transactions/:id` - Update transaction
- `DELETE /api/transactions/:id` - Delete transaction

### Reports
- `GET /api/reports` - Get financial reports

### Health Check
- `GET /health` - API health status
- `GET /` - API information and endpoints

## 🔒 Security Features

- JWT authentication
- Password hashing with bcrypt
- Input validation and sanitization
- Security headers with Helmet.js
- CORS protection
- Rate limiting (configurable)

## 📊 Database Models

- **User**: User authentication and profile data
- **EMI**: EMI loan details and schedules
- **Transaction**: Financial transaction records

## 🧪 Testing

```bash
npm test
```

## 📦 Scripts

- `npm start` - Start production server
- `npm run dev` - Start development server with nodemon
- `npm run add-emi-categories` - Add default EMI categories

## 🌐 Deployment

This API is deployed on Render.com. See `DEPLOYMENT.md` for detailed deployment instructions.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📄 License

This project is licensed under the MIT License.

## 📞 Support

For support and questions, please open an issue on GitHub.

## 🔗 Links

- [Live API](https://emi-backend-wodb.onrender.com)
- [GitHub Repository](https://github.com/JaganML1993/emi-backend)
- [Deployment Guide](DEPLOYMENT.md)
