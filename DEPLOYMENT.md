# EMI Backend Deployment Guide

## 🚀 Deployment Status
Your EMI Backend API is successfully deployed and running at:
**https://emi-backend-wodb.onrender.com**

## 📋 Environment Variables Required

Create a `.env` file in your backend directory with the following variables:

```env
# MongoDB Connection
MONGODB_URL=mongodb+srv://username:password@cluster0.cxori.mongodb.net/emi_tracking?retryWrites=true&w=majority

# Server Configuration
PORT=5000
NODE_ENV=production

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRE=30d

# Optional: CORS Configuration
CORS_ORIGIN=https://your-frontend-domain.com
```

## 🔧 Available API Endpoints

### Root Endpoint
- `GET /` - Welcome message and API information

### Health Check
- `GET /health` - API health status

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/profile` - Get user profile (protected)

### Transactions
- `GET /api/transactions` - Get all transactions
- `POST /api/transactions` - Create new transaction
- `PUT /api/transactions/:id` - Update transaction
- `DELETE /api/transactions/:id` - Delete transaction

### EMIs
- `GET /api/emis` - Get all EMIs
- `POST /api/emis` - Create new EMI
- `PUT /api/emis/:id` - Update EMI
- `DELETE /api/emis/:id` - Delete EMI

### Reports
- `GET /api/reports` - Get financial reports

## 🚀 Deployment Commands

### Local Development
```bash
npm install
npm run dev
```

### Production
```bash
npm install
npm start
```

## 📊 Monitoring

- **Health Check**: Visit `/health` to verify API status
- **Logs**: Check Render dashboard for application logs
- **Database**: Monitor MongoDB Atlas for connection status

## 🔒 Security Features

- Helmet.js for security headers
- CORS protection
- Request validation
- JWT authentication
- Rate limiting (recommended to add)
- Input sanitization

## 🚨 Troubleshooting

### Common Issues:
1. **MongoDB Connection**: Ensure MONGODB_URL is correct
2. **Port Issues**: Render automatically assigns ports
3. **Environment Variables**: Verify all required vars are set

### Logs to Check:
- Application logs in Render dashboard
- MongoDB connection status
- Environment variable loading

## 📈 Next Steps

1. **Add Rate Limiting**: Implement API rate limiting
2. **Add Logging**: Enhanced logging with Winston
3. **Add Testing**: Unit and integration tests
4. **Add Monitoring**: Application performance monitoring
5. **Add Documentation**: Swagger/OpenAPI documentation

## 🔗 Useful Links

- [Render Dashboard](https://dashboard.render.com)
- [MongoDB Atlas](https://cloud.mongodb.com)
- [API Documentation](https://emi-backend-wodb.onrender.com)
