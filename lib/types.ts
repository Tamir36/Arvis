import type { UserRole, OrderStatus, PaymentStatus, ProductStatus } from "@prisma/client";

// Re-export for convenience
export type { UserRole, OrderStatus, PaymentStatus, ProductStatus };

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface ProductWithRelations {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  basePrice: number;
  status: ProductStatus;
  sku: string | null;
  weight: number | null;
  tags: string | null;
  createdAt: Date;
  category: { id: string; name: string } | null;
  images: { id: string; url: string; isPrimary: boolean }[];
  inventory: { quantity: number; reserved: number; minStock: number } | null;
  variants: ProductVariantData[];
}

export interface ProductVariantData {
  id: string;
  name: string;
  size: string | null;
  color: string | null;
  price: number | null;
  sku: string | null;
  stock: number;
  isActive: boolean;
}

export interface OrderWithRelations {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  subtotal: number;
  discount: number;
  deliveryFee: number;
  tax: number;
  total: number;
  notes: string | null;
  shippingAddress: string | null;
  createdAt: Date;
  updatedAt: Date;
  customer: {
    id: string;
    name: string;
    email: string | null;
    phone: string;
    address: string | null;
    district: string | null;
    city: string;
  };
  items: OrderItemData[];
  coupon: { code: string; type: string; value: number } | null;
}

export interface OrderItemData {
  id: string;
  name: string;
  qty: number;
  unitPrice: number;
  discount: number;
  tax: number;
  total: number;
  product: { id: string; name: string };
  variant: { id: string; name: string } | null;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: Date;
  user: { id: string; name: string; email: string };
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  data: T;
  meta?: PaginationMeta;
  message?: string;
}

export interface ApiError {
  error: string;
  details?: unknown;
}

export type SortOrder = "asc" | "desc";

export interface ListParams {
  page?: number;
  limit?: number;
  search?: string;
  sort?: string;
  order?: SortOrder;
}
