export type OrderStatus =
  | 'New'
  | 'Confirmed'
  | 'Preparing'
  | 'Ready for pickup'
  | 'Out for delivery'
  | 'Completed'
  | 'Cancelled';

export const ORDER_STATUSES: OrderStatus[] = [
  'New',
  'Confirmed',
  'Preparing',
  'Ready for pickup',
  'Out for delivery',
  'Completed',
  'Cancelled',
];

export interface ProductCustomization {
  id: number;
  productId: number;
  groupName: string;
  optionName: string;
  priceDeltaEgp: number;
  isRequired: boolean;
  isMultiSelect: boolean;
  sortOrder: number;
}

export interface Product {
  id: number;
  categoryId: number;
  name: string;
  description: string;
  priceEgp: number;
  promoPriceEgp: number | null;
  imageUrl: string;
  isAvailable: boolean;
  isFeatured: boolean;
  sortOrder: number;
  customizations: ProductCustomization[];
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  description: string;
  imageUrl: string;
  sortOrder: number;
  isActive: boolean;
}

export interface RestaurantSettings {
  id: number;
  name: string;
  logoUrl: string;
  tagline: string;
  description: string;
  phone: string;
  email: string;
  address: string;
  lat: number;
  lng: number;
  openingHours: string;
  deliveryFeeEgp: number;
  minOrderEgp: number;
  instagramUrl: string;
  facebookUrl: string;
  tiktokUrl: string;
}

export interface OrderItemCustomization {
  id: number;
  orderItemId: number;
  customizationId: number | null;
  groupName: string;
  optionName: string;
  priceDeltaEgp: number;
}

export interface OrderItem {
  id: number;
  orderId: number;
  productId: number | null;
  productName: string;
  unitPriceEgp: number;
  quantity: number;
  lineTotalEgp: number;
  customizations: OrderItemCustomization[];
}

export interface Order {
  id: number;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  orderType: 'delivery' | 'pickup';
  deliveryAddress: string;
  deliveryLat: number | null;
  deliveryLng: number | null;
  specialInstructions: string;
  paymentMethod: 'cash_on_delivery' | 'pay_on_pickup';
  status: OrderStatus;
  subtotalEgp: number;
  deliveryFeeEgp: number;
  totalEgp: number;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
}

export interface CartItem {
  cartKey: string;
  product: Product;
  quantity: number;
  selectedCustomizations: ProductCustomization[];
}

export type UserRole = 'owner' | 'admin' | 'staff' | 'customer';

export interface UserProfile {
  id: number;
  uid: string;
  supabaseUid?: string | null;
  email: string;
  displayName: string | null;
  role: UserRole;
  createdAt: string;
}

export interface CustomerSummary {
  customerName: string;
  customerPhone: string;
  orderCount: number;
  totalSpentEgp: number;
  lastOrderAt: string;
  lastOrderType: 'delivery' | 'pickup';
}

export interface AnalyticsSummary {
  totalOrders: number;
  todayOrders: number;
  pendingOrders: number;
  completedOrders: number;
  totalRevenue: number;
  todayRevenue: number;
  averageOrderValue: number;
  dailyRevenue: Array<{ date: string; revenue: number; orders: number }>;
  statusDistribution: Array<{ status: string; count: number }>;
  popularProducts: Array<{ name: string; quantity: number; revenue: number }>;
  recentOrders: Order[];
}
