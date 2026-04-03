# Arvis Shop - Online Store Management System

Онлайн дэлгүүрийн бүхэлд хэмжээний удирдлагын систем: Бараа, Захиалга, Хүргэлт

## Технологийн Стэк

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: MySQL + Prisma ORM
- **Authentication**: NextAuth.js v5
- **UI Components**: Custom components with Tailwind CSS
- **Charts**: Recharts
- **Rich Text**: Tiptap
- **Forms**: React Hook Form + Zod
- **File Upload**: Local storage
- **Icons**: Lucide React

## Түлхүүр Шинж Чанар (Features)

### 🛍️ Бараа Удирдлага (Product Management)
- ✅ Бараа CRUD операц
- ✅ Ангилал удирдлага
- ✅ Олон зурагтай дэмжлэг
- ✅ Барааны хувилбар (size/color)
- ✅ Агуулахын мэдээлэл (inventory tracking)
- ✅ Үнийн түүх (price history)
- ✅ CSV экспорт/импорт
- ✅ Rich text тайлбар

### 📦 Захиалга Удирдлага (Order Management)
- ✅ Захиалга үүсгэх, засах, цуцлах
- ✅ Захиалгын мөрийн мэдээлэл (order items)
- ✅ Төлбөрийн төлвийн удирдлага
- ✅ Хөнгөлөлт/Купон
- ✅ Audit log (өөрчлөлтийн түүх)
- ✅ Харилцагчийн мэдээлэл

### 🚚 Хүргэлт Удирдлага (Delivery Management)
- ✅ Хүргэлтийн бүс (zones)
- ✅ Жолоочийн хуваарилалт
- ✅ Цагийн цонх (time slots)
- ✅ Хүргэлтийн трэкинг
- ✅ Хүргэлтийн оптимизаци

### 👥 Үүрэг Удирдлага (Role-Based Access)
- ✅ Admin - Бүрэлд хэмжээний нэвтрэлт
- ✅ Operator - Захиалга & Биелэлт удирдлага
- ✅ Driver - Хүргэлт удирдлага

### 🎨 UI/UX
- ✅ Modern design with Tailwind CSS
- ✅ Responsive layout (Mobile, Tablet, Desktop)
- ✅ Dark & Light theme ready
- ✅ Rounded corners (UI elements)
- ✅ Color scheme: Blue, Orange, White

## Суулгацын Зааварчилгаа

### 1. Суулгалт

```bash
# Clone repository
git clone <repo-url>
cd arvis-shop

# Install dependencies
npm install
# or
yarn install
```

### 2. Өгөгдлийн сан Сеттап

```bash
# MySQL суулгалт (Windows/Mac/Linux)
# Windows: https://dev.mysql.com/downloads/mysql/
# Mac: brew install mysql
# Linux: sudo apt-get install mysql-server

# MySQL сервер эхлүүлэх
mysql.server start  # Mac
# or
sudo systemctl start mysql  # Linux
# or Windows MySQL Services

# Өгөгдлийн сан үүсгэх
mysql -u root -p
# SQL командон дээр:
# CREATE DATABASE arvis_shop CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
# EXIT;
```

### 3. Сеттап `.env.local` файл

```bash
# .env.local үүсгэх
cp .env.example .env.local

# Засах:
DATABASE_URL="mysql://root:password@localhost:3306/arvis_shop"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-super-secret-key-here"  # openssl rand -base64 32
```

### 4. Prisma Сеттап

```bash
# Миграци run хийх
npx prisma db push

# Анхны өгөгдөл оруулах (seed)
npm run db:seed

# Prisma Studio (опцион)
npm run db:studio
```

### 5. Хөгжүүлэлтийн сервер эхлүүлэх

```bash
npm run dev
# or
yarn dev
```

Сервер `http://localhost:3000` дээр ажиллах болно.

## Туршилтын Бүртгэл (Demo Accounts)

Анхны өгөгдлийг оруулсны дараа:

| Үүрэг | Имэйл | Нууц үг |
|------|-------|---------|
| Admin | admin@arvis.mn | admin123 |
| Operator | operator@arvis.mn | operator123 |
| Driver | driver@arvis.mn | driver123 |

## Файлын Бүтэц

```
arvis-shop/
├── app/
│   ├── (auth)/              # Authentication pages
│   ├── (dashboard)/         # Dashboard layout
│   ├── api/                 # API routes
│   └── globals.css          # Global styles
├── components/
│   ├── ui/                  # UI components
│   ├── layout/              # Layout components
│   └── [features]/          # Feature-specific components
├── lib/
│   ├── auth.ts              # NextAuth config
│   ├── db.ts                # Prisma client
│   ├── utils.ts             # Utility functions
│   └── types.ts             # TypeScript types
├── locales/
│   └── mn.ts                # Mongolian translations
├── prisma/
│   ├── schema.prisma        # Database schema
│   └── seed.ts              # Seed data
├── public/
│   └── uploads/             # Uploaded files
└── package.json
```

## Ашилгаа

### Бараа Нэмэх
1. Admin → Бараа → Шинэ бараа
2. Нэр, үнэ, ангилал оруулох
3. Зураг оруулах
4. Хувилбарууд нэмэх (опцион)
5. Хадгалах

### Захиалга Бүртгэх
1. Admin → Захиалга → Шинэ захиалга
2. Харилцагч сонгох
3. Бараа сонгож нэмэх
4. Төлбөрийн мэдээлэл оруулах
5. Хадгалах

### Хүргэлт Хуваарилах
1. Admin/Operator → Хүргэлт → Захиалга сонгох
2. Жолооч, цаг сонгох
3. Хуваарилалт үүсгэх

## API Endpoints

### Products
- `GET /api/products` - Get products list
- `GET /api/products/[id]` - Get product details
- `POST /api/products` - Create product
- `PATCH /api/products/[id]` - Update product
- `DELETE /api/products/[id]` - Delete product
- `GET /api/products/export` - Export products as CSV

### Orders
- `GET /api/orders` - Get orders list
- `GET /api/orders/[id]` - Get order details
- `POST /api/orders` - Create order
- `PATCH /api/orders/[id]` - Update order

### Delivery
- `GET /api/delivery/zones` - Get delivery zones
- `GET /api/delivery/assignments` - Get assignments
- `POST /api/delivery/assignments` - Create assignment
- `GET /api/delivery/drivers` - Get drivers

### Other
- `POST /api/upload` - Upload file
- `GET /api/categories` - Get categories

## Аюулгүй Байдал

- CSRF protection: NextAuth CSRF token
- XSS protection: React escaping + CSP headers
- SQL Injection: Prisma parameterized queries
- Authentication: JWT + Bcrypt
- Rate limiting: Can be added via middleware
- HTTPS: Recommended for production

## Development Commands

```bash
# Development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Type checking
# (TypeScript type checking included)

# Database commands
npm run db:push          # Push schema changes
npm run db:migrate       # Create migrations
npm run db:generate      # Generate Prisma client
npm run db:seed          # Seed database
npm run db:studio        # Open Prisma Studio

# Linting
npm run lint
```

## Production Deployment

### Vercel (Recommended for Next.js)

```bash
# 1. Push to GitHub
git push origin main

# 2. Connect GitHub repo to Vercel
# 3. Set environment variables in Vercel dashboard
# 4. Deploy

vercel deploy
```

### Railway (Frontend + Backend Together)

Энэ төсөл дээр frontend болон backend нь нэг Next.js runtime-д ажилладаг тул Railway дээр **нэг service** болгон deploy хийж болно.

1. GitHub repo-г Railway project-т холбох
2. Root Directory-г repo root дээр үлдээх
3. Railway автоматаар [railway.toml](railway.toml) config ашиглана
4. Environment Variables тохируулах:

```bash
DATABASE_URL="mysql://USER:PASSWORD@HOST:3306/DB_NAME"
NEXTAUTH_URL="https://<your-railway-domain>"
NEXTAUTH_SECRET="<long-random-secret>"
UPLOAD_DIR="uploads"
NODE_ENV="production"
```

5. Эхний deploy-ийн дараа нэг удаа migration ажиллуулах:

```bash
npx prisma migrate deploy
```

Тайлбар:
- Build command: `npm run railway:build`
- Start command: `npm run railway:start`
- `railway:start` нь эхлэхдээ `prisma migrate deploy` ажиллуулдаг.

### Docker

```dockerfile
# Dockerfile example
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

### Other Platforms
- AWS EC2
- DigitalOcean
- Heroku
- Self-hosted

## Performance Optimization

- ✅ Image optimization (Next.js Image)
- ✅ Code splitting (Next.js automatic)
- ✅ Static generation where possible
- ✅ Database connection pooling (Prisma)
- ✅ Caching headers
- ✅ Minified CSS (Tailwind)

## Troubleshooting

### MySQL Connection Error
```bash
# Check MySQL service
mysql.server status  # Mac

# Verify credentials in .env.local
# Make sure database exists
```

### Prisma Issues
```bash
# Regenerate Prisma client
npx prisma generate

# Reset database (WARNING: deletes all data)
npx prisma migrate reset
```

### Build Errors
```bash
# Clear cache
rm -rf .next
npm run build
```

## Contributing

1. Create feature branch: `git checkout -b feature/amazing-feature`
2. Commit changes: `git commit -m 'Add amazing feature'`
3. Push to branch: `git push origin feature/amazing-feature`
4. Open Pull Request

## Support & Documentation

- [Next.js Documentation](https://nextjs.org/docs)
- [Prisma Documentation](https://www.prisma.io/docs/)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [NextAuth.js](https://next-auth.js.org/)

## License

MIT License - feel free to use this project for personal and commercial purposes.

## Contact

- Email: info@arvis.mn
- Phone: +976 70001122

---

**Анхаарах:** Энэ бол сургалтын төслөн хувьд зориулсан бүрэлэг дэлгүүрийн удирдлагын систем юм. Production ашигла өмнө асуудлын хэмжээг шалгана уу.

**For English version:** Please refer to the English documentation or translate this README.
