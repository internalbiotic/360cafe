import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BarChart3,
  Check,
  Coffee,
  DollarSign,
  Edit3,
  Eye,
  EyeOff,
  FolderPlus,
  Globe,
  LayoutDashboard,
  Lock,
  LogOut,
  MapPin,
  Package,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShoppingBag,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { auth, googleAuthProvider } from '../lib/firebase.ts';
import { isSupabaseConfigured, supabase } from '../lib/supabase.ts';
import {
  AnalyticsSummary,
  Category,
  CustomerSummary,
  Order,
  ORDER_STATUSES,
  OrderStatus,
  Product,
  RestaurantSettings,
  UserProfile,
} from '../types.ts';
import { CafeLogo } from './BrandMotifs.tsx';
import { CafeLocationMap } from './GoogleMapsWidgets.tsx';

interface AdminDashboardProps {
  settings: RestaurantSettings | null;
  categories: Category[];
  products: Product[];
  onRefreshStorefront: () => Promise<void>;
  onNavigateStorefront: () => void;
}

type AdminTab =
  | 'overview'
  | 'orders'
  | 'menu'
  | 'customers'
  | 'analytics'
  | 'content'
  | 'settings'
  | 'team';

const STATUS_BADGE_MAP: Record<string, string> = {
  New: 'text-[#7B5FA8] bg-[#F2ECF8] border-[#947ABD]/30',
  Confirmed: 'text-sky-700 bg-sky-50 border-sky-200',
  Preparing: 'text-amber-700 bg-amber-50 border-amber-200',
  'Ready for pickup': 'text-indigo-700 bg-indigo-50 border-indigo-200',
  'Out for delivery': 'text-violet-700 bg-violet-50 border-violet-200',
  Completed: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  Cancelled: 'text-red-700 bg-red-50 border-red-200',
};

interface EditableCustomization {
  groupName: string;
  optionName: string;
  priceDeltaEgp: number;
  isRequired: boolean;
  isMultiSelect: boolean;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  settings,
  categories,
  products,
  onRefreshStorefront,
  onNavigateStorefront,
}) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [sbUser, setSbUser] = useState<SupabaseUser | null>(null);
  const [sbEmail, setSbEmail] = useState('');
  const [sbPassword, setSbPassword] = useState('');
  const [sbAuthMode, setSbAuthMode] = useState<'signin' | 'signup'>('signin');
  const [sbSubmitting, setSbSubmitting] = useState(false);
  const [sbNotice, setSbNotice] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [orders, setOrders] = useState<Order[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [teamProfiles, setTeamProfiles] = useState<UserProfile[]>([]);
  const [customerData, setCustomerData] = useState<{
    registeredCustomers: UserProfile[];
    orderCustomers: CustomerSummary[];
  } | null>(null);
  const [linkCodeInfo, setLinkCodeInfo] = useState<{
    linkToken: string;
    expiresAt: string;
  } | null>(null);
  const [generatingLinkCode, setGeneratingLinkCode] = useState(false);
  const [redeemCode, setRedeemCode] = useState('');
  const [redeemingCode, setRedeemingCode] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);

  // Order filters
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('All');
  const [orderDateFilter, setOrderDateFilter] = useState<string>('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Analytics date range
  const [analyticsFrom, setAnalyticsFrom] = useState('');
  const [analyticsTo, setAnalyticsTo] = useState('');

  // Menu management state
  const [menuCatFilter, setMenuCatFilter] = useState<number | 'all'>('all');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [prodForm, setProdForm] = useState({
    categoryId: 0,
    name: '',
    description: '',
    priceEgp: '',
    promoPriceEgp: '',
    imageUrl: '/src/assets/images/drink_hot_espresso_1795554216923.jpg',
    isAvailable: true,
    isFeatured: false,
  });
  const [prodCustomizations, setProdCustomizations] = useState<EditableCustomization[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryDesc, setNewCategoryDesc] = useState('');
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  // Settings form
  const [settingsForm, setSettingsForm] = useState({
    name: '',
    logoUrl: '',
    tagline: '',
    description: '',
    phone: '',
    email: '',
    address: '',
    lat: 30.2283,
    lng: 31.4796,
    openingHours: '',
    deliveryFeeEgp: 35,
    minOrderEgp: 100,
    instagramUrl: '',
    facebookUrl: '',
    tiktokUrl: '',
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const tokenRef = useRef<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  useEffect(() => {
    if (settings) {
      setSettingsForm({
        name: settings.name,
        logoUrl: settings.logoUrl,
        tagline: settings.tagline,
        description: settings.description,
        phone: settings.phone,
        email: settings.email,
        address: settings.address,
        lat: settings.lat,
        lng: settings.lng,
        openingHours: settings.openingHours,
        deliveryFeeEgp: settings.deliveryFeeEgp,
        minOrderEgp: settings.minOrderEgp,
        instagramUrl: settings.instagramUrl,
        facebookUrl: settings.facebookUrl,
        tiktokUrl: settings.tiktokUrl,
      });
    }
  }, [settings]);

  const getActiveAccessToken = useCallback(async (): Promise<string | null> => {
    if (supabase) {
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) {
        return data.session.access_token;
      }
    }
    if (auth.currentUser) {
      return auth.currentUser.getIdToken();
    }
    return null;
  }, []);

  const authFetch = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const token = await getActiveAccessToken();
      if (!token) throw new Error('Not authenticated');
      tokenRef.current = token;
      return fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
          Authorization: `Bearer ${token}`,
        },
      });
    },
    [getActiveAccessToken]
  );

  const loadAdminData = useCallback(async () => {
    if (!profile) return;
    try {
      const role = profile.role;
      if (role !== 'owner' && role !== 'admin' && role !== 'staff') return;

      const ordersRes = await authFetch('/api/admin/orders');
      if (ordersRes.ok) setOrders(await ordersRes.json());

      // Staff only has permission for orders and live WebSocket order updates
      if (role === 'staff') return;

      const qs = new URLSearchParams();
      if (analyticsFrom) qs.set('from', analyticsFrom);
      if (analyticsTo) qs.set('to', analyticsTo);

      const adminCalls: Promise<Response>[] = [
        authFetch(`/api/admin/analytics?${qs.toString()}`),
        authFetch('/api/admin/customers'),
      ];
      if (role === 'owner') {
        adminCalls.push(authFetch('/api/admin/profiles'));
      }

      const [analyticsRes, customersRes, profilesRes] = await Promise.all(adminCalls);
      if (analyticsRes?.ok) setAnalytics(await analyticsRes.json());
      if (customersRes?.ok) setCustomerData(await customersRes.json());
      if (profilesRes?.ok) setTeamProfiles(await profilesRes.json());
    } catch (err) {
      console.error('Failed loading admin data:', err);
    }
  }, [authFetch, analyticsFrom, analyticsTo, profile]);

  useEffect(() => {
    let active = true;

    const syncTokenWithBackend = async (token: string | null) => {
      if (!active) return;
      if (!token) {
        setProfile(null);
        setAuthLoading(false);
        return;
      }
      setAuthError(null);
      try {
        tokenRef.current = token;
        const res = await fetch('/api/auth/sync', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!active) return;
        if (!res.ok) {
          setAuthError(data?.error || 'Could not verify account');
          setProfile(null);
        } else {
          setProfile(data.profile);
        }
      } catch {
        if (active) setAuthError('Failed to verify authentication session.');
      } finally {
        if (active) setAuthLoading(false);
      }
    };

    const evaluateActiveSession = async () => {
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        if (data.session?.user && data.session.access_token) {
          setSbUser(data.session.user);
          await syncTokenWithBackend(data.session.access_token);
          return;
        }
        setSbUser(null);
      }
      if (auth.currentUser) {
        const fbToken = await auth.currentUser.getIdToken();
        await syncTokenWithBackend(fbToken);
        return;
      }
      await syncTokenWithBackend(null);
    };

    const unsubFirebase = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      void evaluateActiveSession();
    });

    const subAuth = supabase
      ? supabase.auth.onAuthStateChange((_event, session) => {
          setSbUser(session?.user ?? null);
          void evaluateActiveSession();
        })
      : null;

    void evaluateActiveSession();

    return () => {
      active = false;
      unsubFirebase();
      subAuth?.data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!profile) return;
    if (profile.role === 'staff') {
      setActiveTab('orders');
    } else if (
      profile.role === 'admin' &&
      (activeTab === 'settings' || activeTab === 'team')
    ) {
      setActiveTab('overview');
    }
    if (
      profile.role === 'owner' ||
      profile.role === 'admin' ||
      profile.role === 'staff'
    ) {
      void loadAdminData();
    }
  }, [profile, loadAdminData, activeTab]);

  // Real-time WebSocket stream for instant incoming orders & status updates
  useEffect(() => {
    if (
      !profile ||
      (profile.role !== 'owner' && profile.role !== 'admin' && profile.role !== 'staff')
    ) {
      return;
    }
    let ws: WebSocket | null = null;
    let active = true;

    const connectWs = async () => {
      try {
        const token = await getActiveAccessToken();
        if (!token || !active) return;
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(`${proto}//${window.location.host}/ws`);

        ws.onopen = () => {
          ws?.send(JSON.stringify({ type: 'auth', token }));
        };

        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data);
            if (msg?.type === 'auth:ok') {
              setWsConnected(true);
            } else if (msg?.type === 'order:created' && msg.order) {
              setOrders((prev) => {
                if (prev.some((o) => o.id === msg.order.id)) return prev;
                return [msg.order, ...prev];
              });
              showToast(`New order received: ${msg.order.orderNumber}`);
              void loadAdminData();
            } else if (msg?.type === 'order:updated' && msg.order) {
              setOrders((prev) =>
                prev.map((o) => (o.id === msg.order.id ? msg.order : o))
              );
              setSelectedOrder((prev) =>
                prev && prev.id === msg.order.id ? msg.order : prev
              );
              void loadAdminData();
            }
          } catch {
            // ignore
          }
        };

        ws.onclose = () => {
          setWsConnected(false);
        };
      } catch {
        setWsConnected(false);
      }
    };

    void connectWs();
    return () => {
      active = false;
      ws?.close();
    };
  }, [profile, loadAdminData, getActiveAccessToken]);

  const handleSupabaseEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setAuthError(null);
    setSbNotice(null);
    setSbSubmitting(true);
    try {
      const email = sbEmail.trim();
      if (sbAuthMode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: sbPassword,
        });
        if (error) {
          setAuthError(error.message);
        } else if (data.user && !data.session) {
          setSbNotice(
            'Account created. Check your email inbox to confirm your address, then sign in.'
          );
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password: sbPassword,
        });
        if (error) {
          setAuthError(error.message);
        }
      }
    } catch (err: any) {
      setAuthError(err?.message || 'Supabase authentication failed.');
    } finally {
      setSbSubmitting(false);
    }
  };

  const handleSupabaseOAuthSignIn = async () => {
    if (!supabase) return;
    setAuthError(null);
    setSbNotice(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href },
    });
    if (error) {
      setAuthError(error.message);
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    setSbNotice(null);
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err: any) {
      setAuthError(err?.message || 'Sign-in cancelled or failed.');
    }
  };

  const handleLogout = async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    await signOut(auth);
    setSbUser(null);
    setProfile(null);
  };

  const handleUpdateOrderStatus = async (orderId: number, status: OrderStatus) => {
    try {
      const res = await authFetch(`/api/admin/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        const updated = await res.json();
        setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
        if (selectedOrder?.id === orderId) setSelectedOrder(updated);
        showToast(`Order updated to ${status}`);
        void loadAdminData();
      }
    } catch {
      showToast('Failed to update order status');
    }
  };

  const filteredOrders = useMemo(() => {
    const q = orderSearch.toLowerCase().trim();
    return orders.filter((o) => {
      if (orderStatusFilter !== 'All' && o.status !== orderStatusFilter) return false;
      if (orderDateFilter) {
        const d = new Date(o.createdAt).toISOString().slice(0, 10);
        if (d !== orderDateFilter) return false;
      }
      if (q) {
        const hay = `${o.orderNumber} ${o.customerName} ${o.customerPhone} ${o.deliveryAddress}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [orders, orderSearch, orderStatusFilter, orderDateFilter]);

  const openCreateProduct = () => {
    setEditingProduct(null);
    setProdForm({
      categoryId: categories[0]?.id || 0,
      name: '',
      description: '',
      priceEgp: '',
      promoPriceEgp: '',
      imageUrl: '/src/assets/images/drink_hot_espresso_1795554216923.jpg',
      isAvailable: true,
      isFeatured: false,
    });
    setProdCustomizations([]);
    setProductModalOpen(true);
  };

  const openEditProduct = (p: Product) => {
    setEditingProduct(p);
    setProdForm({
      categoryId: p.categoryId,
      name: p.name,
      description: p.description,
      priceEgp: String(p.priceEgp),
      promoPriceEgp: p.promoPriceEgp !== null ? String(p.promoPriceEgp) : '',
      imageUrl: p.imageUrl,
      isAvailable: p.isAvailable,
      isFeatured: p.isFeatured,
    });
    setProdCustomizations(
      p.customizations.map((c) => ({
        groupName: c.groupName,
        optionName: c.optionName,
        priceDeltaEgp: c.priceDeltaEgp,
        isRequired: c.isRequired,
        isMultiSelect: c.isMultiSelect,
      }))
    );
    setProductModalOpen(true);
  };

  const handleImageFileUpload = async (
    file: File,
    onSuccess: (url: string) => void
  ) => {
    setUploadingImage(true);
    try {
      const reader = new FileReader();
      const dataUrl: string = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await authFetch('/api/admin/upload', {
        method: 'POST',
        body: JSON.stringify({ dataUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data?.error || 'Upload failed');
        return;
      }
      onSuccess(data.url);
      showToast('Image uploaded');
    } catch {
      showToast('Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      categoryId: Number(prodForm.categoryId),
      name: prodForm.name.trim(),
      description: prodForm.description.trim(),
      priceEgp: Number(prodForm.priceEgp),
      promoPriceEgp: prodForm.promoPriceEgp ? Number(prodForm.promoPriceEgp) : null,
      imageUrl: prodForm.imageUrl.trim(),
      isAvailable: prodForm.isAvailable,
      isFeatured: prodForm.isFeatured,
      customizations: prodCustomizations,
    };

    const url = editingProduct
      ? `/api/admin/products/${editingProduct.id}`
      : '/api/admin/products';
    const method = editingProduct ? 'PATCH' : 'POST';

    const res = await authFetch(url, { method, body: JSON.stringify(payload) });
    if (res.ok) {
      setProductModalOpen(false);
      await onRefreshStorefront();
      showToast(editingProduct ? 'Product updated' : 'Product created');
    } else {
      const err = await res.json();
      showToast(err?.error || 'Failed to save product');
    }
  };

  const handleToggleProductAvailability = async (p: Product) => {
    const res = await authFetch(`/api/admin/products/${p.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isAvailable: !p.isAvailable }),
    });
    if (res.ok) {
      await onRefreshStorefront();
      showToast(`${p.name} marked ${!p.isAvailable ? 'available' : 'unavailable'}`);
    }
  };

  const handleDeleteProduct = async (p: Product) => {
    const res = await authFetch(`/api/admin/products/${p.id}`, { method: 'DELETE' });
    if (res.ok) {
      await onRefreshStorefront();
      showToast(`Deleted ${p.name}`);
    }
  };

  const handleMoveProduct = async (p: Product, dir: -1 | 1) => {
    const list = products.filter((x) => menuCatFilter === 'all' || x.categoryId === menuCatFilter);
    const idx = list.findIndex((x) => x.id === p.id);
    const targetIdx = idx + dir;
    if (idx < 0 || targetIdx < 0 || targetIdx >= list.length) return;
    const swapped = [...list];
    const [removed] = swapped.splice(idx, 1);
    swapped.splice(targetIdx, 0, removed);

    await authFetch('/api/admin/products/reorder', {
      method: 'POST',
      body: JSON.stringify({ orderedIds: swapped.map((x) => x.id) }),
    });
    await onRefreshStorefront();
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    const res = await authFetch('/api/admin/categories', {
      method: 'POST',
      body: JSON.stringify({
        name: newCategoryName.trim(),
        description: newCategoryDesc.trim(),
      }),
    });
    if (res.ok) {
      setNewCategoryName('');
      setNewCategoryDesc('');
      await onRefreshStorefront();
      showToast('Category added');
    }
  };

  const handleUpdateCategory = async (cat: Category) => {
    const res = await authFetch(`/api/admin/categories/${cat.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: cat.name,
        description: cat.description,
        isActive: cat.isActive,
      }),
    });
    if (res.ok) {
      setEditingCategory(null);
      await onRefreshStorefront();
      showToast('Category updated');
    }
  };

  const handleDeleteCategory = async (id: number) => {
    const res = await authFetch(`/api/admin/categories/${id}`, { method: 'DELETE' });
    if (res.ok) {
      await onRefreshStorefront();
      showToast('Category removed');
    }
  };

  const handleMoveCategory = async (cat: Category, dir: -1 | 1) => {
    const idx = categories.findIndex((c) => c.id === cat.id);
    const targetIdx = idx + dir;
    if (idx < 0 || targetIdx < 0 || targetIdx >= categories.length) return;
    const swapped = [...categories];
    const [removed] = swapped.splice(idx, 1);
    swapped.splice(targetIdx, 0, removed);
    await authFetch('/api/admin/categories/reorder', {
      method: 'POST',
      body: JSON.stringify({ orderedIds: swapped.map((c) => c.id) }),
    });
    await onRefreshStorefront();
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const res = await authFetch('/api/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          ...settingsForm,
          lat: Number(settingsForm.lat),
          lng: Number(settingsForm.lng),
          deliveryFeeEgp: Number(settingsForm.deliveryFeeEgp),
          minOrderEgp: Number(settingsForm.minOrderEgp),
        }),
      });
      if (res.ok) {
        await onRefreshStorefront();
        showToast('Restaurant settings saved');
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err?.error || 'Failed to save settings');
      }
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveWebsiteContent = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const res = await authFetch('/api/admin/content', {
        method: 'PATCH',
        body: JSON.stringify({
          tagline: settingsForm.tagline,
          description: settingsForm.description,
          openingHours: settingsForm.openingHours,
          instagramUrl: settingsForm.instagramUrl,
          facebookUrl: settingsForm.facebookUrl,
          tiktokUrl: settingsForm.tiktokUrl,
        }),
      });
      if (res.ok) {
        await onRefreshStorefront();
        showToast('Website content saved');
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err?.error || 'Failed to save website content');
      }
    } finally {
      setSavingSettings(false);
    }
  };

  const handleGenerateLinkCode = async () => {
    setGeneratingLinkCode(true);
    try {
      const res = await authFetch('/api/admin/owner/link-token', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setLinkCodeInfo(data);
        showToast('One-time link code generated (valid 10 minutes)');
      } else {
        showToast(data?.error || 'Failed to generate link code');
      }
    } finally {
      setGeneratingLinkCode(false);
    }
  };

  const handleRedeemOwnerLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setRedeemError(null);
    setRedeemingCode(true);
    try {
      const res = await authFetch('/api/auth/redeem-owner-link', {
        method: 'POST',
        body: JSON.stringify({ linkToken: redeemCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRedeemError(data?.error || 'Could not link Supabase account.');
      } else {
        setRedeemCode('');
        setProfile(data.profile);
        showToast('Owner account linked to Supabase successfully');
      }
    } catch {
      setRedeemError('Failed to verify link code.');
    } finally {
      setRedeemingCode(false);
    }
  };

  const handleRoleChange = async (profileId: number, role: string) => {
    const res = await authFetch(`/api/admin/profiles/${profileId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
    if (res.ok) {
      await loadAdminData();
      showToast('Staff permissions updated');
    } else {
      const err = await res.json();
      showToast(err?.error || 'Could not update role');
    }
  };

  // Loading auth state
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#F2ECF8] flex items-center justify-center p-6">
        <div className="text-center">
          <CafeLogo variant="purple" className="h-14 w-auto mx-auto" />
          <p className="text-sm text-[#7B5FA8] font-medium mt-4">
            Verifying administrator session...
          </p>
        </div>
      </div>
    );
  }

  // Unauthenticated Login Gate
  if ((!firebaseUser && !sbUser) || !profile) {
    return (
      <div className="min-h-screen bg-circles-lavender flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl border border-[#947ABD]/20 text-center">
          <CafeLogo variant="purple" className="h-14 w-auto mx-auto" />
          <div className="mt-6 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-[#7B5FA8]">
            <Lock className="w-3.5 h-3.5" />
            Private Restaurant Console
          </div>
          <h1 className="font-display font-black uppercase text-2xl text-[#28232D] mt-2">
            360 Café Admin
          </h1>
          <p className="text-sm text-[#28232D]/70 mt-2">
            Sign in to manage live orders, digital menu items, and café settings.
          </p>

          {authError && (
            <div className="mt-4 rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs text-red-700">
              {authError}
            </div>
          )}

          {sbNotice && (
            <div className="mt-4 rounded-xl bg-[#F2ECF8] border border-[#947ABD]/30 px-3.5 py-2.5 text-xs text-[#7B5FA8]">
              {sbNotice}
            </div>
          )}

          {isSupabaseConfigured ? (
            <div className="mt-5 text-left">
              <form onSubmit={handleSupabaseEmailAuth} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-[#28232D]/75 mb-1">
                    Email address
                  </label>
                  <input
                    type="email"
                    required
                    value={sbEmail}
                    onChange={(e) => setSbEmail(e.target.value)}
                    placeholder="you@360-cafe.com"
                    className="w-full rounded-xl border border-[#947ABD]/25 px-3.5 py-2.5 text-sm text-[#28232D] focus:outline-none focus:border-[#947ABD]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#28232D]/75 mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={sbPassword}
                    onChange={(e) => setSbPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-[#947ABD]/25 px-3.5 py-2.5 text-sm text-[#28232D] focus:outline-none focus:border-[#947ABD]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={sbSubmitting}
                  className="w-full py-3 px-5 rounded-xl bg-[#947ABD] hover:bg-[#7B5FA8] disabled:opacity-60 text-white font-display font-bold text-sm transition-colors cursor-pointer"
                >
                  {sbSubmitting
                    ? 'Please wait...'
                    : sbAuthMode === 'signin'
                      ? 'Sign in with Supabase'
                      : 'Create Supabase Account'}
                </button>
              </form>

              <div className="mt-2.5 flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setSbAuthMode((m) => (m === 'signin' ? 'signup' : 'signin'));
                    setAuthError(null);
                    setSbNotice(null);
                  }}
                  className="font-semibold text-[#7B5FA8] hover:underline cursor-pointer"
                >
                  {sbAuthMode === 'signin'
                    ? 'Need an account? Sign up'
                    : 'Already have an account? Sign in'}
                </button>
                <button
                  type="button"
                  onClick={handleSupabaseOAuthSignIn}
                  className="font-semibold text-[#28232D]/75 hover:text-[#7B5FA8] cursor-pointer"
                >
                  Google (Supabase)
                </button>
              </div>

              <div className="relative my-4 flex items-center">
                <div className="flex-grow border-t border-[#947ABD]/15" />
                <span className="mx-3 text-[11px] uppercase tracking-wider text-[#28232D]/45 font-semibold">
                  or
                </span>
                <div className="flex-grow border-t border-[#947ABD]/15" />
              </div>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="w-full py-2.5 px-5 rounded-xl border border-[#947ABD]/30 hover:bg-[#F2ECF8] text-[#28232D] font-display font-bold text-sm transition-colors cursor-pointer"
              >
                Sign in with Google
              </button>
            </div>
          ) : (
            <>
              <div className="mt-4 rounded-xl bg-[#F2ECF8] border border-[#947ABD]/25 px-3.5 py-2.5 text-xs text-[#28232D]/75 text-left">
                Supabase client ready. Add{' '}
                <code className="font-mono text-[#7B5FA8]">VITE_SUPABASE_URL</code> and{' '}
                <code className="font-mono text-[#7B5FA8]">VITE_SUPABASE_PUBLISHABLE_KEY</code>{' '}
                in environment settings to enable Supabase email &amp; OAuth sign-in.
              </div>
              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="mt-4 w-full py-3.5 px-5 rounded-xl bg-[#947ABD] hover:bg-[#7B5FA8] text-white font-display font-bold text-sm transition-colors cursor-pointer"
              >
                Sign in with Google
              </button>
            </>
          )}

          <button
            type="button"
            onClick={onNavigateStorefront}
            className="mt-3 w-full py-2.5 px-4 rounded-xl border border-[#947ABD]/25 text-xs font-semibold text-[#28232D]/75 hover:bg-[#F2ECF8] transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Return to 360 Café Website
          </button>
        </div>
      </div>
    );
  }

  // Unauthorized Role Screen (Customer)
  if (
    profile.role !== 'owner' &&
    profile.role !== 'admin' &&
    profile.role !== 'staff'
  ) {
    return (
      <div className="min-h-screen bg-[#F2ECF8] flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl border border-[#947ABD]/20 text-center">
          <Lock className="w-10 h-10 text-red-500 mx-auto" />
          <h1 className="font-display font-bold text-xl text-[#28232D] mt-3">
            Access Restricted
          </h1>
          <p className="text-sm text-[#28232D]/70 mt-2">
            Signed in as <strong>{profile.email}</strong> (role:{' '}
            <span className="font-mono font-semibold">{profile.role}</span>), which does not
            have operational or administrator privileges.
          </p>

          {sbUser && (
            <form
              onSubmit={handleRedeemOwnerLink}
              className="mt-5 rounded-2xl bg-[#F8F6FB] border border-[#947ABD]/20 p-4 text-left space-y-2.5"
            >
              <div className="text-xs font-bold text-[#7B5FA8]">
                Transitioning an existing Owner account?
              </div>
              <p className="text-[11px] text-[#28232D]/65">
                Paste the one-time link code generated from your existing Owner session to
                bind this Supabase login to your Owner profile.
              </p>
              {redeemError && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
                  {redeemError}
                </div>
              )}
              <input
                type="text"
                value={redeemCode}
                onChange={(e) => setRedeemCode(e.target.value)}
                placeholder="Paste one-time owner link code"
                className="w-full rounded-xl border border-[#947ABD]/25 bg-white px-3 py-2 text-xs font-mono text-[#28232D]"
              />
              <button
                type="submit"
                disabled={redeemingCode || !redeemCode.trim()}
                className="w-full py-2 rounded-xl bg-[#947ABD] hover:bg-[#7B5FA8] disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
              >
                {redeemingCode ? 'Linking...' : 'Link Supabase Login to Owner Profile'}
              </button>
            </form>
          )}

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={handleLogout}
              className="flex-1 py-2.5 rounded-xl bg-[#28232D] text-white text-sm font-semibold cursor-pointer"
            >
              Sign Out
            </button>
            <button
              type="button"
              onClick={onNavigateStorefront}
              className="flex-1 py-2.5 rounded-xl border border-[#947ABD]/30 text-[#7B5FA8] text-sm font-semibold cursor-pointer"
            >
              Storefront
            </button>
          </div>
        </div>
      </div>
    );
  }

  const maxDailyRevenue = Math.max(
    ...(analytics?.dailyRevenue.map((d) => d.revenue) || [100]),
    100
  );

  const visibleMenuProducts = products.filter(
    (p) => menuCatFilter === 'all' || p.categoryId === menuCatFilter
  );

  const navItems: Array<{ id: AdminTab; label: string; icon: React.ComponentType<{ className?: string }> }> =
    profile.role === 'owner'
      ? [
          { id: 'overview', label: 'Overview', icon: LayoutDashboard },
          { id: 'orders', label: 'Live Orders', icon: ShoppingBag },
          { id: 'menu', label: 'Menu & Categories', icon: Coffee },
          { id: 'customers', label: 'Customers', icon: Users },
          { id: 'analytics', label: 'Sales Analytics', icon: BarChart3 },
          { id: 'settings', label: 'Settings & Map', icon: Settings },
          { id: 'team', label: 'Staff & Roles', icon: Lock },
        ]
      : profile.role === 'admin'
        ? [
            { id: 'overview', label: 'Overview', icon: LayoutDashboard },
            { id: 'orders', label: 'Live Orders', icon: ShoppingBag },
            { id: 'menu', label: 'Menu & Categories', icon: Coffee },
            { id: 'customers', label: 'Customers', icon: Users },
            { id: 'analytics', label: 'Sales Analytics', icon: BarChart3 },
            { id: 'content', label: 'Website Content', icon: Globe },
          ]
        : [{ id: 'orders', label: 'Live Orders', icon: ShoppingBag }];

  return (
    <div className="min-h-screen bg-[#F8F6FB] text-[#28232D] flex flex-col lg:flex-row">
      {/* Admin Sidebar */}
      <aside className="w-full lg:w-64 bg-white border-b lg:border-b-0 lg:border-r border-[#947ABD]/15 flex flex-col shrink-0">
        <div className="px-6 py-5 border-b border-[#947ABD]/12 flex items-center justify-between">
          <CafeLogo
            variant="purple"
            logoUrl={settings?.logoUrl}
            name={settings?.name || '360 Café'}
            className="h-9 w-auto"
          />
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#7B5FA8]">
            {profile.role}
          </span>
        </div>

        <nav className="p-3 flex lg:flex-col gap-1 overflow-x-auto no-scrollbar flex-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#947ABD] text-white'
                    : 'text-[#28232D]/75 hover:bg-[#F2ECF8] hover:text-[#28232D]'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
                {item.id === 'orders' && (analytics?.pendingOrders ?? 0) > 0 && (
                  <span
                    className={`ml-auto font-mono text-xs px-1.5 py-0.5 rounded-md tabular-nums ${
                      active ? 'bg-white text-[#7B5FA8]' : 'bg-[#F2ECF8] text-[#7B5FA8]'
                    }`}
                  >
                    {analytics?.pendingOrders}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[#947ABD]/12 hidden lg:block space-y-2">
          <div className="text-xs text-[#28232D]/65 truncate">{profile.email}</div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onNavigateStorefront}
              className="flex-1 py-2 px-3 rounded-lg border border-[#947ABD]/25 text-xs font-semibold text-[#7B5FA8] hover:bg-[#F2ECF8] cursor-pointer"
            >
              View Site
            </button>
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Sign out"
              className="py-2 px-3 rounded-lg border border-[#28232D]/15 text-xs font-semibold text-[#28232D]/75 hover:bg-red-50 hover:text-red-700 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Admin Workspace */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Breadcrumb Bar */}
        <header className="bg-white border-b border-[#947ABD]/15 px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="font-display font-black uppercase text-lg sm:text-xl text-[#28232D] truncate">
              {activeTab === 'overview' && 'Dashboard Overview'}
              {activeTab === 'orders' && 'Live Order Queue'}
              {activeTab === 'menu' && 'Menu & Category Manager'}
              {activeTab === 'customers' && 'Customer Directory'}
              {activeTab === 'analytics' && 'Sales & Revenue Analytics'}
              {activeTab === 'content' && 'Website Editorial Content'}
              {activeTab === 'settings' && 'Restaurant Settings & Location'}
              {activeTab === 'team' && 'Owner & Staff Permissions'}
            </h1>
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-[#7B5FA8]">
              <span
                className={`w-2 h-2 rounded-full ${
                  wsConnected ? 'bg-emerald-500' : 'bg-amber-400'
                }`}
              />
              {wsConnected ? 'Live Stream Active' : 'Connecting...'}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void loadAdminData()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#947ABD]/25 text-xs font-semibold text-[#7B5FA8] hover:bg-[#F2ECF8] cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
            <button
              type="button"
              onClick={onNavigateStorefront}
              className="lg:hidden px-3 py-2 rounded-xl bg-[#947ABD] text-white text-xs font-semibold"
            >
              Storefront
            </button>
          </div>
        </header>

        {toastMsg && (
          <div className="bg-[#28232D] text-white px-6 py-2.5 text-xs font-semibold flex items-center justify-between">
            <span>{toastMsg}</span>
            <button type="button" onClick={() => setToastMsg(null)}>
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <main className="p-4 sm:p-6 lg:p-8 flex-1 overflow-y-auto space-y-6">
          {/* OVERVIEW TAB */}
          {activeTab === 'overview' &&
            (profile.role === 'owner' || profile.role === 'admin') && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {[
                  {
                    label: 'Total Revenue',
                    value: `${analytics?.totalRevenue ?? 0} EGP`,
                    sub: `Today: ${analytics?.todayRevenue ?? 0} EGP`,
                    icon: DollarSign,
                  },
                  {
                    label: "Today's Orders",
                    value: String(analytics?.todayOrders ?? 0),
                    sub: `Total: ${analytics?.totalOrders ?? 0} orders`,
                    icon: ShoppingBag,
                  },
                  {
                    label: 'Pending Kitchen',
                    value: String(analytics?.pendingOrders ?? 0),
                    sub: 'Active in progress',
                    icon: Package,
                  },
                  {
                    label: 'Completed Orders',
                    value: String(analytics?.completedOrders ?? 0),
                    sub: `Avg: ${analytics?.averageOrderValue ?? 0} EGP`,
                    icon: Check,
                  },
                ].map((kpi) => {
                  const Icon = kpi.icon;
                  return (
                    <div
                      key={kpi.label}
                      className="rounded-2xl bg-white border border-[#947ABD]/15 p-5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-[#28232D]/55">
                          {kpi.label}
                        </span>
                        <Icon className="w-4 h-4 text-[#947ABD]" />
                      </div>
                      <div className="font-mono font-bold text-2xl text-[#28232D] mt-2 tabular-nums">
                        {kpi.value}
                      </div>
                      <div className="text-xs text-[#7B5FA8] font-medium mt-1 tabular-nums">
                        {kpi.sub}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Sales Chart */}
                <div className="lg:col-span-7 rounded-2xl bg-white border border-[#947ABD]/15 p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="font-display font-bold text-base text-[#28232D]">
                        Sales Overview
                      </h2>
                      <p className="text-xs text-[#28232D]/60">
                        Daily revenue (excluding cancelled orders)
                      </p>
                    </div>
                  </div>
                  {analytics && analytics.dailyRevenue.length > 0 ? (
                    <div className="h-52 flex items-end gap-2 pt-4">
                      {analytics.dailyRevenue.map((d) => {
                        const pct = Math.max(8, Math.round((d.revenue / maxDailyRevenue) * 100));
                        return (
                          <div
                            key={d.date}
                            className="flex-1 flex flex-col items-center gap-1.5 group"
                          >
                            <span className="font-mono text-[10px] text-[#7B5FA8] opacity-0 group-hover:opacity-100 transition-opacity tabular-nums">
                              {d.revenue}
                            </span>
                            <div className="w-full bg-[#F2ECF8] rounded-t-lg h-36 flex items-end overflow-hidden">
                              <div
                                className="w-full bg-[#947ABD] hover:bg-[#7B5FA8] rounded-t-lg transition-all"
                                style={{ height: `${pct}%` }}
                              />
                            </div>
                            <span className="font-mono text-[10px] text-[#28232D]/55 tabular-nums">
                              {d.date.slice(5)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="h-52 flex items-center justify-center text-sm text-[#28232D]/50">
                      No completed sales recorded yet. Place a test order to see live charts.
                    </div>
                  )}
                </div>

                {/* Popular Products */}
                <div className="lg:col-span-5 rounded-2xl bg-white border border-[#947ABD]/15 p-6">
                  <h2 className="font-display font-bold text-base text-[#28232D] mb-4">
                    Best-Selling Items
                  </h2>
                  {analytics && analytics.popularProducts.length > 0 ? (
                    <div className="divide-y divide-[#947ABD]/10">
                      {analytics.popularProducts.slice(0, 5).map((item) => (
                        <div
                          key={item.name}
                          className="py-2.5 flex items-center justify-between text-sm"
                        >
                          <span className="font-medium text-[#28232D] truncate pr-3">
                            {item.name}
                          </span>
                          <div className="text-right font-mono text-xs shrink-0 tabular-nums">
                            <span className="font-bold text-[#7B5FA8]">
                              {item.quantity} sold
                            </span>
                            <span className="text-[#28232D]/50 ml-2">
                              {item.revenue} EGP
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-[#28232D]/55">
                      Best-selling items will appear here once orders arrive.
                    </p>
                  )}
                </div>
              </div>

              {/* Recent Orders */}
              <div className="rounded-2xl bg-white border border-[#947ABD]/15 overflow-hidden">
                <div className="px-6 py-4 border-b border-[#947ABD]/12 flex items-center justify-between">
                  <h2 className="font-display font-bold text-base text-[#28232D]">
                    Recent Orders
                  </h2>
                  <button
                    type="button"
                    onClick={() => setActiveTab('orders')}
                    className="text-xs font-bold text-[#7B5FA8] hover:underline cursor-pointer"
                  >
                    Manage All Orders
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#F2ECF8]/60 text-xs uppercase tracking-wider text-[#28232D]/60">
                      <tr>
                        <th className="px-6 py-3">Order #</th>
                        <th className="px-6 py-3">Customer</th>
                        <th className="px-6 py-3">Type</th>
                        <th className="px-6 py-3">Status</th>
                        <th className="px-6 py-3 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#947ABD]/10">
                      {orders.slice(0, 6).map((o) => (
                        <tr
                          key={o.id}
                          onClick={() => {
                            setSelectedOrder(o);
                            setActiveTab('orders');
                          }}
                          className="hover:bg-[#F2ECF8]/40 cursor-pointer"
                        >
                          <td className="px-6 py-3 font-mono font-semibold text-xs">
                            {o.orderNumber}
                          </td>
                          <td className="px-6 py-3">
                            <div className="font-semibold">{o.customerName}</div>
                            <div className="text-xs text-[#28232D]/55 font-mono">
                              {o.customerPhone}
                            </div>
                          </td>
                          <td className="px-6 py-3 capitalize text-xs">{o.orderType}</td>
                          <td className="px-6 py-3">
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-md border text-xs font-semibold ${
                                STATUS_BADGE_MAP[o.status] || ''
                              }`}
                            >
                              {o.status}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-right font-mono font-bold tabular-nums">
                            {o.totalEgp} EGP
                          </td>
                        </tr>
                      ))}
                      {orders.length === 0 && (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-6 py-8 text-center text-sm text-[#28232D]/55"
                          >
                            No orders yet. Orders submitted from the website appear here
                            live.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* LIVE ORDERS TAB */}
          {activeTab === 'orders' && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-white border border-[#947ABD]/15 p-4 flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-4 h-4 text-[#947ABD] absolute left-3 top-2.5" />
                  <input
                    type="search"
                    value={orderSearch}
                    onChange={(e) => setOrderSearch(e.target.value)}
                    placeholder="Search order #, customer, phone, address..."
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-[#947ABD]/25 text-sm focus:outline-none focus:ring-2 focus:ring-[#947ABD]"
                  />
                </div>
                <select
                  value={orderStatusFilter}
                  onChange={(e) => setOrderStatusFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-[#947ABD]/25 text-sm bg-white"
                >
                  <option value="All">All Statuses</option>
                  {ORDER_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={orderDateFilter}
                  onChange={(e) => setOrderDateFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-[#947ABD]/25 text-sm bg-white"
                />
                {orderDateFilter && (
                  <button
                    type="button"
                    onClick={() => setOrderDateFilter('')}
                    className="text-xs font-semibold text-[#7B5FA8] hover:underline"
                  >
                    Clear Date
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                <div className="xl:col-span-7 rounded-2xl bg-white border border-[#947ABD]/15 overflow-hidden">
                  <div className="divide-y divide-[#947ABD]/12">
                    {filteredOrders.map((o) => (
                      <div
                        key={o.id}
                        onClick={() => setSelectedOrder(o)}
                        className={`p-4 cursor-pointer transition-colors ${
                          selectedOrder?.id === o.id
                            ? 'bg-[#F2ECF8]/80'
                            : 'hover:bg-[#F2ECF8]/35'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2.5">
                              <span className="font-mono font-bold text-sm text-[#28232D]">
                                {o.orderNumber}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold ${
                                  STATUS_BADGE_MAP[o.status] || ''
                                }`}
                              >
                                {o.status}
                              </span>
                            </div>
                            <p className="text-sm font-semibold text-[#28232D] mt-1">
                              {o.customerName} ·{' '}
                              <span className="font-mono text-xs text-[#28232D]/70">
                                {o.customerPhone}
                              </span>
                            </p>
                            <p className="text-xs text-[#28232D]/60 mt-0.5">
                              {o.orderType === 'delivery'
                                ? o.deliveryAddress
                                : 'Store Pickup'}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-mono font-bold text-sm text-[#7B5FA8] tabular-nums">
                              {o.totalEgp} EGP
                            </div>
                            <div className="text-[11px] font-mono text-[#28232D]/50 mt-0.5">
                              {new Date(o.createdAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {filteredOrders.length === 0 && (
                      <div className="p-10 text-center text-sm text-[#28232D]/55">
                        No orders match your current filters.
                      </div>
                    )}
                  </div>
                </div>

                {/* Selected Order Inspector */}
                <div className="xl:col-span-5 rounded-2xl bg-white border border-[#947ABD]/15 p-6 h-fit">
                  {selectedOrder ? (
                    <div className="space-y-5">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-[#7B5FA8]">
                            Order Details
                          </p>
                          <h3 className="font-mono font-bold text-lg text-[#28232D]">
                            {selectedOrder.orderNumber}
                          </h3>
                        </div>
                        <span
                          className={`px-2.5 py-1 rounded-lg border text-xs font-bold ${
                            STATUS_BADGE_MAP[selectedOrder.status] || ''
                          }`}
                        >
                          {selectedOrder.status}
                        </span>
                      </div>

                      <div className="rounded-xl bg-[#F2ECF8]/60 p-4 space-y-1.5 text-sm">
                        <div>
                          <strong>Customer:</strong> {selectedOrder.customerName}
                        </div>
                        <div>
                          <strong>Phone:</strong>{' '}
                          <span className="font-mono">{selectedOrder.customerPhone}</span>
                        </div>
                        <div>
                          <strong>Fulfillment:</strong>{' '}
                          <span className="capitalize">{selectedOrder.orderType}</span> (
                          {selectedOrder.paymentMethod === 'cash_on_delivery'
                            ? 'Cash on Delivery'
                            : 'Pay on Pickup'}
                          )
                        </div>
                        {selectedOrder.orderType === 'delivery' && (
                          <div>
                            <strong>Address:</strong> {selectedOrder.deliveryAddress}
                          </div>
                        )}
                        {selectedOrder.specialInstructions && (
                          <div>
                            <strong>Notes:</strong> {selectedOrder.specialInstructions}
                          </div>
                        )}
                      </div>

                      <div>
                        <h4 className="font-display font-bold text-xs uppercase tracking-wider text-[#28232D]/60 mb-2">
                          Items
                        </h4>
                        <div className="divide-y divide-[#947ABD]/10">
                          {selectedOrder.items.map((item) => (
                            <div key={item.id} className="py-2 flex justify-between text-sm">
                              <div>
                                <span className="font-semibold">
                                  {item.quantity}x {item.productName}
                                </span>
                                {item.customizations.length > 0 && (
                                  <p className="text-xs text-[#28232D]/60">
                                    {item.customizations
                                      .map((c) => c.optionName)
                                      .join(', ')}
                                  </p>
                                )}
                              </div>
                              <span className="font-mono tabular-nums">
                                {item.lineTotalEgp} EGP
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 pt-3 border-t border-[#947ABD]/15 space-y-1 text-sm">
                          <div className="flex justify-between text-[#28232D]/70">
                            <span>Subtotal</span>
                            <span className="font-mono tabular-nums">
                              {selectedOrder.subtotalEgp} EGP
                            </span>
                          </div>
                          <div className="flex justify-between text-[#28232D]/70">
                            <span>Delivery Fee</span>
                            <span className="font-mono tabular-nums">
                              {selectedOrder.deliveryFeeEgp} EGP
                            </span>
                          </div>
                          <div className="flex justify-between font-bold text-base">
                            <span>Total</span>
                            <span className="font-mono text-[#7B5FA8] tabular-nums">
                              {selectedOrder.totalEgp} EGP
                            </span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-display font-bold text-xs uppercase tracking-wider text-[#28232D]/60 mb-2">
                          Update Order Status
                        </h4>
                        <div className="grid grid-cols-2 gap-2">
                          {ORDER_STATUSES.map((st) => (
                            <button
                              key={st}
                              type="button"
                              onClick={() =>
                                void handleUpdateOrderStatus(selectedOrder.id, st)
                              }
                              className={`py-2 px-3 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                                selectedOrder.status === st
                                  ? 'bg-[#947ABD] text-white border-[#947ABD]'
                                  : st === 'Cancelled'
                                    ? 'border-red-200 text-red-700 hover:bg-red-50'
                                    : 'border-[#947ABD]/25 text-[#28232D] hover:bg-[#F2ECF8]'
                              }`}
                            >
                              {st}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="py-12 text-center text-sm text-[#28232D]/55">
                      Select an order from the list to inspect items and update status.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* MENU & CATEGORIES TAB */}
          {activeTab === 'menu' &&
            (profile.role === 'owner' || profile.role === 'admin') && (
            <div className="space-y-8">
              {/* Categories Manager */}
              <div className="rounded-2xl bg-white border border-[#947ABD]/15 p-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
                  <div>
                    <h2 className="font-display font-bold text-lg text-[#28232D]">
                      Menu Categories
                    </h2>
                    <p className="text-xs text-[#28232D]/60">
                      Add, rename, reorder, or hide categories immediately on the public
                      menu.
                    </p>
                  </div>
                  <form onSubmit={handleCreateCategory} className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="New category name"
                      required
                      className="px-3 py-2 rounded-xl border border-[#947ABD]/25 text-sm"
                    />
                    <input
                      type="text"
                      value={newCategoryDesc}
                      onChange={(e) => setNewCategoryDesc(e.target.value)}
                      placeholder="Short description"
                      className="px-3 py-2 rounded-xl border border-[#947ABD]/25 text-sm"
                    />
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#947ABD] text-white text-xs font-bold uppercase cursor-pointer"
                    >
                      <FolderPlus className="w-4 h-4" />
                      Add Category
                    </button>
                  </form>
                </div>

                <div className="divide-y divide-[#947ABD]/10">
                  {categories.map((cat, idx) => (
                    <div
                      key={cat.id}
                      className="py-3 flex flex-wrap items-center justify-between gap-3"
                    >
                      {editingCategory?.id === cat.id ? (
                        <div className="flex flex-wrap items-center gap-2 flex-1">
                          <input
                            type="text"
                            value={editingCategory.name}
                            onChange={(e) =>
                              setEditingCategory({ ...editingCategory, name: e.target.value })
                            }
                            className="px-3 py-1.5 rounded-lg border border-[#947ABD] text-sm"
                          />
                          <input
                            type="text"
                            value={editingCategory.description}
                            onChange={(e) =>
                              setEditingCategory({
                                ...editingCategory,
                                description: e.target.value,
                              })
                            }
                            className="px-3 py-1.5 rounded-lg border border-[#947ABD]/30 text-sm flex-1 min-w-[200px]"
                          />
                          <button
                            type="button"
                            onClick={() => void handleUpdateCategory(editingCategory)}
                            className="px-3 py-1.5 rounded-lg bg-[#947ABD] text-white text-xs font-bold"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingCategory(null)}
                            className="px-3 py-1.5 rounded-lg border text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          <div>
                            <div className="font-semibold text-sm text-[#28232D]">
                              {cat.name}{' '}
                              {!cat.isActive && (
                                <span className="text-xs text-red-600">(Hidden)</span>
                              )}
                            </div>
                            <div className="text-xs text-[#28232D]/55">{cat.description}</div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => void handleMoveCategory(cat, -1)}
                              aria-label="Move category up"
                              className="p-1.5 rounded-lg border border-[#947ABD]/20 disabled:opacity-30 hover:bg-[#F2ECF8]"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === categories.length - 1}
                              onClick={() => void handleMoveCategory(cat, 1)}
                              aria-label="Move category down"
                              className="p-1.5 rounded-lg border border-[#947ABD]/20 disabled:opacity-30 hover:bg-[#F2ECF8]"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void handleUpdateCategory({
                                  ...cat,
                                  isActive: !cat.isActive,
                                })
                              }
                              className="px-2.5 py-1.5 rounded-lg border border-[#947ABD]/20 text-xs font-semibold hover:bg-[#F2ECF8]"
                            >
                              {cat.isActive ? 'Visible' : 'Hidden'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingCategory(cat)}
                              aria-label="Edit category"
                              className="p-1.5 rounded-lg border border-[#947ABD]/20 hover:bg-[#F2ECF8]"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteCategory(cat.id)}
                              aria-label="Delete category"
                              className="p-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Products Manager */}
              <div className="rounded-2xl bg-white border border-[#947ABD]/15 p-6">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
                  <div className="flex items-center gap-3">
                    <h2 className="font-display font-bold text-lg text-[#28232D]">
                      Menu Products
                    </h2>
                    <select
                      value={menuCatFilter}
                      onChange={(e) =>
                        setMenuCatFilter(
                          e.target.value === 'all' ? 'all' : Number(e.target.value)
                        )
                      }
                      className="px-3 py-1.5 rounded-xl border border-[#947ABD]/25 text-xs font-semibold bg-white"
                    >
                      <option value="all">All Categories</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={openCreateProduct}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#947ABD] hover:bg-[#7B5FA8] text-white text-xs font-bold uppercase tracking-wide cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Add Product
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#F2ECF8]/60 text-xs uppercase tracking-wider text-[#28232D]/60">
                      <tr>
                        <th className="px-4 py-3">Product</th>
                        <th className="px-4 py-3">Category</th>
                        <th className="px-4 py-3">Price</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#947ABD]/10">
                      {visibleMenuProducts.map((p, idx) => (
                        <tr key={p.id} className="hover:bg-[#F2ECF8]/30">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <img
                                src={p.imageUrl}
                                alt={p.name}
                                referrerPolicy="no-referrer"
                                className="w-11 h-11 rounded-lg object-cover bg-[#F2ECF8] shrink-0"
                              />
                              <div>
                                <div className="font-semibold text-[#28232D]">
                                  {p.name}
                                  {p.isFeatured && (
                                    <span className="ml-2 text-[11px] font-bold text-[#7B5FA8]">
                                      · Featured
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-[#28232D]/55 line-clamp-1 max-w-xs">
                                  {p.description}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {categories.find((c) => c.id === p.categoryId)?.name || '—'}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs tabular-nums">
                            {p.promoPriceEgp ? (
                              <>
                                <strong className="text-[#7B5FA8]">{p.promoPriceEgp} EGP</strong>
                                <span className="ml-1.5 line-through text-[#28232D]/45">
                                  {p.priceEgp}
                                </span>
                              </>
                            ) : (
                              <strong>{p.priceEgp} EGP</strong>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => void handleToggleProductAvailability(p)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border cursor-pointer ${
                                p.isAvailable
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                  : 'border-red-200 bg-red-50 text-red-700'
                              }`}
                            >
                              {p.isAvailable ? (
                                <Eye className="w-3 h-3" />
                              ) : (
                                <EyeOff className="w-3 h-3" />
                              )}
                              {p.isAvailable ? 'Available' : 'Sold Out'}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => void handleMoveProduct(p, -1)}
                                aria-label="Move product up"
                                className="p-1.5 rounded-lg border border-[#947ABD]/20 disabled:opacity-30 hover:bg-[#F2ECF8]"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={idx === visibleMenuProducts.length - 1}
                                onClick={() => void handleMoveProduct(p, 1)}
                                aria-label="Move product down"
                                className="p-1.5 rounded-lg border border-[#947ABD]/20 disabled:opacity-30 hover:bg-[#F2ECF8]"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditProduct(p)}
                                aria-label="Edit product"
                                className="p-1.5 rounded-lg border border-[#947ABD]/20 hover:bg-[#F2ECF8]"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteProduct(p)}
                                aria-label="Delete product"
                                className="p-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ANALYTICS TAB */}
          {activeTab === 'analytics' &&
            (profile.role === 'owner' || profile.role === 'admin') && (
            <div className="space-y-6">
              <div className="rounded-2xl bg-white border border-[#947ABD]/15 p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  {[
                    { label: 'Today', days: 0 },
                    { label: 'Last 7 Days', days: 7 },
                    { label: 'Last 30 Days', days: 30 },
                    { label: 'All Time', days: -1 },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        if (preset.days === -1) {
                          setAnalyticsFrom('');
                          setAnalyticsTo('');
                        } else {
                          const end = new Date();
                          const start = new Date();
                          start.setDate(end.getDate() - preset.days);
                          setAnalyticsFrom(start.toISOString().slice(0, 10));
                          setAnalyticsTo(end.toISOString().slice(0, 10));
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg border border-[#947ABD]/25 text-xs font-semibold hover:bg-[#F2ECF8] cursor-pointer"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={analyticsFrom}
                    onChange={(e) => setAnalyticsFrom(e.target.value)}
                    className="px-3 py-1.5 rounded-lg border border-[#947ABD]/25 text-xs"
                  />
                  <span className="text-xs text-[#28232D]/50">to</span>
                  <input
                    type="date"
                    value={analyticsTo}
                    onChange={(e) => setAnalyticsTo(e.target.value)}
                    className="px-3 py-1.5 rounded-lg border border-[#947ABD]/25 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-2xl bg-white border border-[#947ABD]/15 p-5">
                  <span className="text-xs font-bold uppercase text-[#28232D]/55">
                    Filtered Revenue
                  </span>
                  <div className="font-mono font-bold text-2xl text-[#7B5FA8] mt-1 tabular-nums">
                    {analytics?.totalRevenue ?? 0} EGP
                  </div>
                </div>
                <div className="rounded-2xl bg-white border border-[#947ABD]/15 p-5">
                  <span className="text-xs font-bold uppercase text-[#28232D]/55">
                    Total Orders
                  </span>
                  <div className="font-mono font-bold text-2xl text-[#28232D] mt-1 tabular-nums">
                    {analytics?.totalOrders ?? 0}
                  </div>
                </div>
                <div className="rounded-2xl bg-white border border-[#947ABD]/15 p-5">
                  <span className="text-xs font-bold uppercase text-[#28232D]/55">
                    Average Order Value
                  </span>
                  <div className="font-mono font-bold text-2xl text-[#28232D] mt-1 tabular-nums">
                    {analytics?.averageOrderValue ?? 0} EGP
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="rounded-2xl bg-white border border-[#947ABD]/15 p-6">
                  <h3 className="font-display font-bold text-base mb-4">
                    Order Status Distribution
                  </h3>
                  <div className="space-y-3">
                    {(analytics?.statusDistribution || []).map((row) => {
                      const total = Math.max(1, analytics?.totalOrders || 1);
                      const pct = Math.round((row.count / total) * 100);
                      return (
                        <div key={row.status}>
                          <div className="flex justify-between text-xs font-semibold mb-1">
                            <span>{row.status}</span>
                            <span className="font-mono tabular-nums">
                              {row.count} ({pct}%)
                            </span>
                          </div>
                          <div className="h-2.5 rounded-full bg-[#F2ECF8] overflow-hidden">
                            <div
                              className="h-full bg-[#947ABD] rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                    {(analytics?.statusDistribution || []).length === 0 && (
                      <p className="text-sm text-[#28232D]/50">No order data for range.</p>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl bg-white border border-[#947ABD]/15 p-6">
                  <h3 className="font-display font-bold text-base mb-4">
                    Top Selling Products
                  </h3>
                  <div className="divide-y divide-[#947ABD]/10">
                    {(analytics?.popularProducts || []).map((prod) => (
                      <div
                        key={prod.name}
                        className="py-2.5 flex items-center justify-between text-sm"
                      >
                        <span className="font-medium">{prod.name}</span>
                        <span className="font-mono text-xs tabular-nums">
                          <strong>{prod.quantity}x</strong> · {prod.revenue} EGP
                        </span>
                      </div>
                    ))}
                    {(analytics?.popularProducts || []).length === 0 && (
                      <p className="text-sm text-[#28232D]/50">No sales in selected range.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SETTINGS & GOOGLE MAPS COORDINATES TAB (Owner ONLY) */}
          {activeTab === 'settings' && profile.role === 'owner' && (
            <form
              onSubmit={handleSaveSettings}
              className="grid grid-cols-1 lg:grid-cols-12 gap-6"
            >
              <div className="lg:col-span-7 rounded-2xl bg-white border border-[#947ABD]/15 p-6 space-y-4">
                <h2 className="font-display font-bold text-lg text-[#28232D]">
                  Brand, Delivery &amp; Contact Settings
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold mb-1">
                      Restaurant Name
                    </label>
                    <input
                      type="text"
                      value={settingsForm.name}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, name: e.target.value })
                      }
                      className="w-full px-3.5 py-2 rounded-xl border border-[#947ABD]/25 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Tagline</label>
                    <input
                      type="text"
                      value={settingsForm.tagline}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, tagline: e.target.value })
                      }
                      className="w-full px-3.5 py-2 rounded-xl border border-[#947ABD]/25 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Brand Description
                  </label>
                  <textarea
                    rows={3}
                    value={settingsForm.description}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, description: e.target.value })
                    }
                    className="w-full px-3.5 py-2 rounded-xl border border-[#947ABD]/25 text-sm"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Phone</label>
                    <input
                      type="text"
                      value={settingsForm.phone}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, phone: e.target.value })
                      }
                      className="w-full px-3.5 py-2 rounded-xl border border-[#947ABD]/25 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Email</label>
                    <input
                      type="email"
                      value={settingsForm.email}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, email: e.target.value })
                      }
                      className="w-full px-3.5 py-2 rounded-xl border border-[#947ABD]/25 text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold mb-1">
                      Opening Hours
                    </label>
                    <input
                      type="text"
                      value={settingsForm.openingHours}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          openingHours: e.target.value,
                        })
                      }
                      className="w-full px-3.5 py-2 rounded-xl border border-[#947ABD]/25 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">
                      Delivery Fee (EGP)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={settingsForm.deliveryFeeEgp}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          deliveryFeeEgp: Number(e.target.value),
                        })
                      }
                      className="w-full px-3.5 py-2 rounded-xl border border-[#947ABD]/25 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">
                      Minimum Order (EGP)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={settingsForm.minOrderEgp}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          minOrderEgp: Number(e.target.value),
                        })
                      }
                      className="w-full px-3.5 py-2 rounded-xl border border-[#947ABD]/25 text-sm font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">Address</label>
                  <input
                    type="text"
                    value={settingsForm.address}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, address: e.target.value })
                    }
                    className="w-full px-3.5 py-2 rounded-xl border border-[#947ABD]/25 text-sm"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Instagram URL</label>
                    <input
                      type="url"
                      value={settingsForm.instagramUrl}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, instagramUrl: e.target.value })
                      }
                      className="w-full px-3.5 py-2 rounded-xl border border-[#947ABD]/25 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Facebook URL</label>
                    <input
                      type="url"
                      value={settingsForm.facebookUrl}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, facebookUrl: e.target.value })
                      }
                      className="w-full px-3.5 py-2 rounded-xl border border-[#947ABD]/25 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">TikTok URL</label>
                    <input
                      type="url"
                      value={settingsForm.tiktokUrl}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, tiktokUrl: e.target.value })
                      }
                      className="w-full px-3.5 py-2 rounded-xl border border-[#947ABD]/25 text-xs"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={savingSettings}
                  className="px-6 py-3 rounded-xl bg-[#947ABD] hover:bg-[#7B5FA8] text-white font-display font-bold text-sm cursor-pointer"
                >
                  {savingSettings ? 'Saving...' : 'Save Restaurant Settings'}
                </button>
              </div>

              <div className="lg:col-span-5 rounded-2xl bg-white border border-[#947ABD]/15 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-display font-bold text-base flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-[#947ABD]" />
                    Map Coordinates Picker
                  </h3>
                  <span className="text-xs text-[#7B5FA8]">Click map to move pin</span>
                </div>

                <CafeLocationMap
                  lat={settingsForm.lat}
                  lng={settingsForm.lng}
                  name={settingsForm.name}
                  address={settingsForm.address}
                  openingHours={settingsForm.openingHours}
                  interactivePick
                  onPickCoordinates={(c) =>
                    setSettingsForm((prev) => ({ ...prev, lat: c.lat, lng: c.lng }))
                  }
                  heightClass="h-72"
                />

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Latitude</label>
                    <input
                      type="number"
                      step="0.000001"
                      value={settingsForm.lat}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, lat: Number(e.target.value) })
                      }
                      className="w-full px-3 py-2 rounded-xl border border-[#947ABD]/25 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Longitude</label>
                    <input
                      type="number"
                      step="0.000001"
                      value={settingsForm.lng}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, lng: Number(e.target.value) })
                      }
                      className="w-full px-3 py-2 rounded-xl border border-[#947ABD]/25 text-sm font-mono"
                    />
                  </div>
                </div>
              </div>
            </form>
          )}

          {/* CUSTOMERS TAB (Admin & Owner) */}
          {activeTab === 'customers' &&
            (profile.role === 'owner' || profile.role === 'admin') && (
              <div className="space-y-6">
                <div className="rounded-2xl bg-white border border-[#947ABD]/15 p-6">
                  <h2 className="font-display font-bold text-lg text-[#28232D] mb-1">
                    Ordering Customers
                  </h2>
                  <p className="text-xs text-[#28232D]/60 mb-4">
                    Aggregated from storefront orders by phone number.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-[#F2ECF8]/60 text-xs uppercase text-[#28232D]/60">
                        <tr>
                          <th className="px-4 py-3">Customer</th>
                          <th className="px-4 py-3">Phone</th>
                          <th className="px-4 py-3">Orders</th>
                          <th className="px-4 py-3">Spent (EGP)</th>
                          <th className="px-4 py-3">Last Order</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#947ABD]/10">
                        {(customerData?.orderCustomers || []).map((c) => (
                          <tr key={c.customerPhone}>
                            <td className="px-4 py-3 font-semibold">{c.customerName}</td>
                            <td className="px-4 py-3 text-xs font-mono">{c.customerPhone}</td>
                            <td className="px-4 py-3 font-mono tabular-nums">{c.orderCount}</td>
                            <td className="px-4 py-3 font-mono font-bold text-[#7B5FA8] tabular-nums">
                              {c.totalSpentEgp} EGP
                            </td>
                            <td className="px-4 py-3 text-xs text-[#28232D]/65">
                              {new Date(c.lastOrderAt).toLocaleDateString()} ({c.lastOrderType})
                            </td>
                          </tr>
                        ))}
                        {(customerData?.orderCustomers || []).length === 0 && (
                          <tr>
                            <td
                              colSpan={5}
                              className="px-4 py-6 text-center text-sm text-[#28232D]/50"
                            >
                              No customer orders recorded yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-2xl bg-white border border-[#947ABD]/15 p-6">
                  <h2 className="font-display font-bold text-lg text-[#28232D] mb-1">
                    Registered Customer Accounts
                  </h2>
                  <p className="text-xs text-[#28232D]/60 mb-4">
                    New sign-ups always receive the customer role with zero admin access.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-[#F2ECF8]/60 text-xs uppercase text-[#28232D]/60">
                        <tr>
                          <th className="px-4 py-3">Name</th>
                          <th className="px-4 py-3">Email</th>
                          <th className="px-4 py-3">Joined</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#947ABD]/10">
                        {(customerData?.registeredCustomers || []).map((u) => (
                          <tr key={u.id}>
                            <td className="px-4 py-3 font-semibold">
                              {u.displayName || 'Customer'}
                            </td>
                            <td className="px-4 py-3 text-xs font-mono">{u.email}</td>
                            <td className="px-4 py-3 text-xs text-[#28232D]/65">
                              {new Date(u.createdAt).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                        {(customerData?.registeredCustomers || []).length === 0 && (
                          <tr>
                            <td
                              colSpan={3}
                              className="px-4 py-6 text-center text-sm text-[#28232D]/50"
                            >
                              No registered customer accounts yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

          {/* WEBSITE CONTENT TAB (Admin editorial copy & social links) */}
          {activeTab === 'content' &&
            (profile.role === 'owner' || profile.role === 'admin') && (
              <form
                onSubmit={handleSaveWebsiteContent}
                className="max-w-3xl rounded-2xl bg-white border border-[#947ABD]/15 p-6 space-y-4"
              >
                <div>
                  <h2 className="font-display font-bold text-lg text-[#28232D]">
                    Website Copy &amp; Social Channels
                  </h2>
                  <p className="text-xs text-[#28232D]/60 mt-1">
                    Update public brand copy and social links. Pricing fees, coordinates, and
                    staff roles are restricted to the Owner.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">Tagline</label>
                  <input
                    type="text"
                    value={settingsForm.tagline}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, tagline: e.target.value })
                    }
                    className="w-full px-3.5 py-2 rounded-xl border border-[#947ABD]/25 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Brand Description
                  </label>
                  <textarea
                    rows={3}
                    value={settingsForm.description}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, description: e.target.value })
                    }
                    className="w-full px-3.5 py-2 rounded-xl border border-[#947ABD]/25 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">Opening Hours</label>
                  <input
                    type="text"
                    value={settingsForm.openingHours}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, openingHours: e.target.value })
                    }
                    className="w-full px-3.5 py-2 rounded-xl border border-[#947ABD]/25 text-sm"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Instagram URL</label>
                    <input
                      type="url"
                      value={settingsForm.instagramUrl}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, instagramUrl: e.target.value })
                      }
                      className="w-full px-3.5 py-2 rounded-xl border border-[#947ABD]/25 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Facebook URL</label>
                    <input
                      type="url"
                      value={settingsForm.facebookUrl}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, facebookUrl: e.target.value })
                      }
                      className="w-full px-3.5 py-2 rounded-xl border border-[#947ABD]/25 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">TikTok URL</label>
                    <input
                      type="url"
                      value={settingsForm.tiktokUrl}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, tiktokUrl: e.target.value })
                      }
                      className="w-full px-3.5 py-2 rounded-xl border border-[#947ABD]/25 text-xs"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={savingSettings}
                  className="px-6 py-3 rounded-xl bg-[#947ABD] hover:bg-[#7B5FA8] text-white font-display font-bold text-sm cursor-pointer"
                >
                  {savingSettings ? 'Saving...' : 'Save Website Content'}
                </button>
              </form>
            )}

          {/* TEAM / RBAC TAB (Owner ONLY) */}
          {activeTab === 'team' && profile.role === 'owner' && (
            <div className="space-y-6">
              <div className="rounded-2xl bg-white border border-[#947ABD]/15 p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="font-display font-bold text-lg text-[#28232D]">
                      Owner Supabase Account Link
                    </h2>
                    <p className="text-xs text-[#28232D]/60 mt-1 max-w-2xl">
                      Securely attach your Supabase Auth account to this single Owner profile
                      using a one-time cryptographic code (no email auto-elevation and no
                      duplicate owner rows). Your Firebase login remains active.
                    </p>
                  </div>
                  {profile.supabaseUid ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-700">
                      <Check className="w-3.5 h-3.5" />
                      Supabase Account Linked
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={generatingLinkCode}
                      onClick={() => void handleGenerateLinkCode()}
                      className="px-4 py-2 rounded-xl bg-[#947ABD] hover:bg-[#7B5FA8] disabled:opacity-60 text-white text-xs font-bold cursor-pointer"
                    >
                      {generatingLinkCode
                        ? 'Generating...'
                        : 'Generate One-Time Supabase Link Code'}
                    </button>
                  )}
                </div>

                {linkCodeInfo && (
                  <div className="mt-4 rounded-xl bg-[#F2ECF8] border border-[#947ABD]/30 p-4 space-y-2">
                    <div className="text-xs font-bold text-[#7B5FA8]">
                      One-Time Link Code (expires{' '}
                      {new Date(linkCodeInfo.expiresAt).toLocaleTimeString()}):
                    </div>
                    <div className="font-mono text-sm font-bold text-[#28232D] break-all select-all bg-white px-3 py-2 rounded-lg border border-[#947ABD]/20">
                      {linkCodeInfo.linkToken}
                    </div>
                    <p className="text-[11px] text-[#28232D]/70">
                      Copy this code, click Sign Out, sign in with your Supabase account, and
                      paste the code on the Access Restricted screen to link it to this Owner
                      profile.
                    </p>
                  </div>
                )}
              </div>

              <div className="rounded-2xl bg-white border border-[#947ABD]/15 p-6">
                <h2 className="font-display font-bold text-lg text-[#28232D] mb-1">
                  Authorized Staff &amp; Administrators
                </h2>
                <p className="text-xs text-[#28232D]/60 mb-5">
                  All public sign-ups start as Customer. Only the Owner can assign Admin or
                  Staff permissions.
                </p>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#F2ECF8]/60 text-xs uppercase text-[#28232D]/60">
                      <tr>
                        <th className="px-4 py-3">User</th>
                        <th className="px-4 py-3">Email</th>
                        <th className="px-4 py-3">Role</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#947ABD]/10">
                      {teamProfiles.map((u) => (
                        <tr key={u.id}>
                          <td className="px-4 py-3 font-semibold">
                            {u.displayName || 'User'}
                          </td>
                          <td className="px-4 py-3 text-xs font-mono">{u.email}</td>
                          <td className="px-4 py-3">
                            {u.role === 'owner' ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F2ECF8] border border-[#947ABD]/30 text-xs font-bold text-[#7B5FA8]">
                                Owner (Protected)
                              </span>
                            ) : (
                              <select
                                value={u.role}
                                onChange={(e) => void handleRoleChange(u.id, e.target.value)}
                                className="px-3 py-1.5 rounded-lg border border-[#947ABD]/25 text-xs font-semibold bg-white"
                              >
                                <option value="admin">
                                  Admin (Menu, Orders, Customers, Content)
                                </option>
                                <option value="staff">Staff (Live Orders Only)</option>
                                <option value="customer">Customer (No Admin)</option>
                              </select>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Add / Edit Product Modal */}
      {productModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#28232D]/50 p-4"
          onClick={() => setProductModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-[#947ABD]/20 max-h-[90vh] flex flex-col overflow-hidden"
          >
            <div className="px-6 py-4 bg-[#947ABD] text-white flex items-center justify-between">
              <h3 className="font-display font-bold text-lg">
                {editingProduct ? `Edit ${editingProduct.name}` : 'Add New Product'}
              </h3>
              <button
                type="button"
                onClick={() => setProductModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={handleSaveProduct}
              className="p-6 overflow-y-auto flex-1 space-y-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1">Category *</label>
                  <select
                    required
                    value={prodForm.categoryId}
                    onChange={(e) =>
                      setProdForm({ ...prodForm, categoryId: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[#947ABD]/25 text-sm bg-white"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Product Name *</label>
                  <input
                    type="text"
                    required
                    value={prodForm.name}
                    onChange={(e) => setProdForm({ ...prodForm, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-[#947ABD]/25 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Description *</label>
                <textarea
                  rows={2}
                  required
                  value={prodForm.description}
                  onChange={(e) =>
                    setProdForm({ ...prodForm, description: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-[#947ABD]/25 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1">Price (EGP) *</label>
                  <input
                    type="number"
                    min={1}
                    step="0.5"
                    required
                    value={prodForm.priceEgp}
                    onChange={(e) =>
                      setProdForm({ ...prodForm, priceEgp: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[#947ABD]/25 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Promo Price (Optional EGP)
                  </label>
                  <input
                    type="number"
                    min={1}
                    step="0.5"
                    value={prodForm.promoPriceEgp}
                    onChange={(e) =>
                      setProdForm({ ...prodForm, promoPriceEgp: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[#947ABD]/25 text-sm font-mono"
                  />
                </div>
              </div>

              {/* Photo Upload */}
              <div>
                <label className="block text-xs font-semibold mb-1">
                  Product Photograph
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  <img
                    src={prodForm.imageUrl}
                    alt="Preview"
                    referrerPolicy="no-referrer"
                    className="w-16 h-16 rounded-xl object-cover bg-[#F2ECF8] border border-[#947ABD]/20"
                  />
                  <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[#947ABD] text-xs font-bold text-[#7B5FA8] hover:bg-[#F2ECF8] cursor-pointer">
                    <Upload className="w-4 h-4" />
                    {uploadingImage ? 'Uploading...' : 'Upload Photo'}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          void handleImageFileUpload(file, (url) =>
                            setProdForm((prev) => ({ ...prev, imageUrl: url }))
                          );
                        }
                      }}
                    />
                  </label>
                  <input
                    type="text"
                    value={prodForm.imageUrl}
                    onChange={(e) =>
                      setProdForm({ ...prodForm, imageUrl: e.target.value })
                    }
                    placeholder="/src/assets/images/..."
                    className="flex-1 min-w-[180px] px-3 py-2 rounded-xl border border-[#947ABD]/25 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center gap-6">
                <label className="inline-flex items-center gap-2 text-sm font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={prodForm.isAvailable}
                    onChange={(e) =>
                      setProdForm({ ...prodForm, isAvailable: e.target.checked })
                    }
                  />
                  Available for ordering
                </label>
                <label className="inline-flex items-center gap-2 text-sm font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={prodForm.isFeatured}
                    onChange={(e) =>
                      setProdForm({ ...prodForm, isFeatured: e.target.checked })
                    }
                  />
                  Featured on Homepage
                </label>
              </div>

              {/* Customization Options Builder */}
              <div className="pt-3 border-t border-[#947ABD]/15 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="font-display font-bold text-sm">
                    Customization Options
                  </h4>
                  <button
                    type="button"
                    onClick={() =>
                      setProdCustomizations((prev) => [
                        ...prev,
                        {
                          groupName: 'Size',
                          optionName: 'Large',
                          priceDeltaEgp: 20,
                          isRequired: false,
                          isMultiSelect: false,
                        },
                      ])
                    }
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-[#F2ECF8] text-[#7B5FA8] text-xs font-bold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Option
                  </button>
                </div>

                {prodCustomizations.map((c, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <input
                      type="text"
                      value={c.groupName}
                      onChange={(e) => {
                        const next = [...prodCustomizations];
                        next[idx] = { ...next[idx], groupName: e.target.value };
                        setProdCustomizations(next);
                      }}
                      placeholder="Group (e.g. Size)"
                      className="col-span-3 px-2.5 py-1.5 rounded-lg border border-[#947ABD]/25 text-xs"
                    />
                    <input
                      type="text"
                      value={c.optionName}
                      onChange={(e) => {
                        const next = [...prodCustomizations];
                        next[idx] = { ...next[idx], optionName: e.target.value };
                        setProdCustomizations(next);
                      }}
                      placeholder="Option (e.g. Oat Milk)"
                      className="col-span-4 px-2.5 py-1.5 rounded-lg border border-[#947ABD]/25 text-xs"
                    />
                    <input
                      type="number"
                      value={c.priceDeltaEgp}
                      onChange={(e) => {
                        const next = [...prodCustomizations];
                        next[idx] = {
                          ...next[idx],
                          priceDeltaEgp: Number(e.target.value),
                        };
                        setProdCustomizations(next);
                      }}
                      placeholder="+EGP"
                      className="col-span-2 px-2.5 py-1.5 rounded-lg border border-[#947ABD]/25 text-xs font-mono"
                    />
                    <label className="col-span-2 inline-flex items-center gap-1 text-[11px]">
                      <input
                        type="checkbox"
                        checked={c.isMultiSelect}
                        onChange={(e) => {
                          const next = [...prodCustomizations];
                          next[idx] = { ...next[idx], isMultiSelect: e.target.checked };
                          setProdCustomizations(next);
                        }}
                      />
                      Multi
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setProdCustomizations((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="col-span-1 text-red-500 flex justify-center"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setProductModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-[#947ABD]/25 text-sm font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-[#947ABD] hover:bg-[#7B5FA8] text-white text-sm font-bold cursor-pointer"
                >
                  Save Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
