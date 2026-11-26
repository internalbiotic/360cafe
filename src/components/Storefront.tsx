import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Clock,
  Coffee,
  Instagram,
  Mail,
  MapPin,
  Menu as MenuIcon,
  Navigation,
  Phone,
  Plus,
  Search,
  ShoppingBag,
  Store,
  Truck,
  X,
} from 'lucide-react';
import { motion } from 'motion/react';
import {
  CartItem,
  Category,
  Order,
  Product,
  ProductCustomization,
  RestaurantSettings,
} from '../types.ts';
import {
  CafeLineArtCroissant,
  CafeLineArtCup,
  CafeLineArtIced,
  CafeLogo,
  CircularPatternStrip,
} from './BrandMotifs.tsx';
import { CafeLocationMap } from './GoogleMapsWidgets.tsx';
import { ProductModal } from './ProductModal.tsx';
import { CartDrawer } from './CartDrawer.tsx';

interface StorefrontProps {
  settings: RestaurantSettings | null;
  categories: Category[];
  products: Product[];
  loading: boolean;
  onNavigateAdmin: () => void;
}

const HERO_IMAGE = '/src/assets/images/hero_cafe_signature_1795554215820.jpg';

export const Storefront: React.FC<StorefrontProps> = ({
  settings,
  categories,
  products,
  loading,
  onNavigateAdmin,
}) => {
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [orderType, setOrderType] = useState<'delivery' | 'pickup'>('delivery');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [trackedOrder, setTrackedOrder] = useState<Order | null>(null);
  const [trackInput, setTrackInput] = useState('');
  const [trackError, setTrackError] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [failedImages, setFailedImages] = useState<Record<number, boolean>>({});

  const activeCategories = useMemo(
    () => categories.filter((c) => c.isActive),
    [categories]
  );

  const categoryNameById = useMemo(() => {
    const map: Record<number, string> = {};
    for (const c of categories) map[c.id] = c.name;
    return map;
  }, [categories]);

  const featuredProducts = useMemo(
    () => products.filter((p) => p.isFeatured && p.isAvailable).slice(0, 6),
    [products]
  );

  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return products.filter((p) => {
      if (selectedCategoryId !== 'all' && p.categoryId !== selectedCategoryId) {
        return false;
      }
      if (q) {
        const hay = `${p.name} ${p.description} ${categoryNameById[p.categoryId] || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [products, selectedCategoryId, searchQuery, categoryNameById]);

  const groupedMenu = useMemo(() => {
    const catsToShow =
      selectedCategoryId === 'all'
        ? activeCategories
        : activeCategories.filter((c) => c.id === selectedCategoryId);

    return catsToShow
      .map((cat) => ({
        category: cat,
        items: filteredProducts.filter((p) => p.categoryId === cat.id),
      }))
      .filter((g) => g.items.length > 0);
  }, [activeCategories, selectedCategoryId, filteredProducts]);

  const totalBagCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const handleAddToCart = (
    product: Product,
    quantity: number,
    selectedCustomizations: ProductCustomization[]
  ) => {
    const custKey = selectedCustomizations
      .map((c) => c.id)
      .sort((a, b) => a - b)
      .join(',');
    const cartKey = `${product.id}::${custKey}`;

    setCart((prev) => {
      const idx = prev.findIndex((i) => i.cartKey === cartKey);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + quantity };
        return next;
      }
      return [...prev, { cartKey, product, quantity, selectedCustomizations }];
    });
  };

  const handleQuickAdd = (product: Product) => {
    if (!product.isAvailable) return;
    if (product.customizations && product.customizations.length > 0) {
      setActiveProduct(product);
    } else {
      handleAddToCart(product, 1, []);
      setCartOpen(true);
    }
  };

  const handleUpdateQty = (cartKey: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.cartKey === cartKey
            ? { ...item, quantity: item.quantity + delta }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const handleTrackOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTrackError(null);
    const num = trackInput.trim();
    if (!num) return;
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(num)}`);
      if (!res.ok) {
        setTrackError('Order number not found.');
        return;
      }
      const data = await res.json();
      setTrackedOrder(data);
      setCartOpen(true);
    } catch {
      setTrackError('Could not look up order.');
    }
  };

  const scrollToMenuCategory = (catId: number | 'all') => {
    setSelectedCategoryId(catId);
    const el = document.getElementById('menu');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const siteName = settings?.name || '360 Café';
  const tagline = settings?.tagline || 'Upgrade your mood.';
  const address =
    settings?.address || 'El Hay El Tarfihy, El Obour City, Cairo Governorate, Egypt';
  const lat = settings?.lat ?? 30.2283;
  const lng = settings?.lng ?? 31.4796;
  const openingHours = settings?.openingHours || 'Daily: 8:00 AM – 2:00 AM';
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    `${lat},${lng}`
  )}`;

  return (
    <div id="home" className="min-h-screen flex flex-col bg-white text-[#28232D]">
      {/* Zone 1–3 Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-[#947ABD]/15">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 md:h-20 flex items-center justify-between gap-8">
          <a href="#home" className="shrink-0 flex items-center">
            <CafeLogo
              variant="purple"
              logoUrl={settings?.logoUrl}
              name={siteName}
              className="h-10 md:h-12 w-auto"
            />
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-semibold text-[#28232D]/80">
            <a
              href="#home"
              className="hover:text-[#7B5FA8] transition-colors whitespace-nowrap shrink-0"
            >
              Home
            </a>
            <a
              href="#menu"
              className="hover:text-[#7B5FA8] transition-colors whitespace-nowrap shrink-0"
            >
              Menu
            </a>
            <a
              href="#about"
              className="hover:text-[#7B5FA8] transition-colors whitespace-nowrap shrink-0"
            >
              About
            </a>
            <a
              href="#location"
              className="hover:text-[#7B5FA8] transition-colors whitespace-nowrap shrink-0"
            >
              Location
            </a>
            <a
              href="#contact"
              className="hover:text-[#7B5FA8] transition-colors whitespace-nowrap shrink-0"
            >
              Contact
            </a>
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-[#947ABD] hover:bg-[#7B5FA8] text-white font-display font-bold text-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-sm"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Order Now</span>
              {totalBagCount > 0 && (
                <span className="font-mono text-xs bg-white text-[#7B5FA8] px-1.5 py-0.5 rounded-md tabular-nums">
                  {totalBagCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setMobileNavOpen((o) => !o)}
              aria-label="Toggle navigation menu"
              className="md:hidden w-10 h-10 rounded-xl border border-[#947ABD]/25 flex items-center justify-center text-[#28232D]"
            >
              {mobileNavOpen ? <X className="w-5 h-5" /> : <MenuIcon className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Drawer Menu */}
        {mobileNavOpen && (
          <div className="md:hidden bg-white border-t border-[#947ABD]/15 px-4 py-4 space-y-2">
            {[
              ['Home', '#home'],
              ['Menu', '#menu'],
              ['About', '#about'],
              ['Location', '#location'],
              ['Contact', '#contact'],
            ].map(([label, href]) => (
              <a
                key={label}
                href={href}
                onClick={() => setMobileNavOpen(false)}
                className="block px-3 py-2.5 rounded-xl text-sm font-semibold text-[#28232D] hover:bg-[#F2ECF8] hover:text-[#7B5FA8]"
              >
                {label}
              </a>
            ))}
          </div>
        )}
      </header>

      {/* KFC-Egypt-Inspired Delivery / Pickup & Order Lookup Bar */}
      <div className="bg-[#F2ECF8] border-b border-[#947ABD]/15">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex bg-white p-1 rounded-xl border border-[#947ABD]/20">
              <button
                type="button"
                onClick={() => setOrderType('delivery')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors whitespace-nowrap ${
                  orderType === 'delivery'
                    ? 'bg-[#947ABD] text-white'
                    : 'text-[#28232D]/70 hover:text-[#28232D]'
                }`}
              >
                <Truck className="w-3.5 h-3.5" />
                Delivery
              </button>
              <button
                type="button"
                onClick={() => setOrderType('pickup')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors whitespace-nowrap ${
                  orderType === 'pickup'
                    ? 'bg-[#947ABD] text-white'
                    : 'text-[#28232D]/70 hover:text-[#28232D]'
                }`}
              >
                <Store className="w-3.5 h-3.5" />
                Pickup
              </button>
            </div>
            <div className="text-xs text-[#28232D]/75 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-[#7B5FA8] shrink-0" />
              <span className="truncate max-w-[260px] sm:max-w-md">{address}</span>
              <span className="hidden sm:inline text-[#947ABD]">·</span>
              <span className="hidden sm:inline font-medium text-[#7B5FA8]">
                {openingHours}
              </span>
            </div>
          </div>

          <form
            onSubmit={handleTrackOrderSubmit}
            className="flex items-center gap-2 self-end md:self-auto"
          >
            <input
              type="text"
              value={trackInput}
              onChange={(e) => setTrackInput(e.target.value)}
              placeholder="Track order # (e.g. 360-12345)"
              className="px-3 py-1.5 rounded-lg bg-white border border-[#947ABD]/25 text-xs text-[#28232D] placeholder:text-[#28232D]/45 focus:outline-none focus:ring-2 focus:ring-[#947ABD] w-48"
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg bg-[#28232D] text-white text-xs font-semibold hover:bg-[#947ABD] transition-colors whitespace-nowrap"
            >
              Track
            </button>
            {trackError && <span className="text-xs text-red-600">{trackError}</span>}
          </form>
        </div>
      </div>

      {/* Hero Section — 360 Café Signature Lavender + Repeating Circles + Line Art */}
      <section className="relative bg-circles-lavender text-white overflow-hidden">
        {/* Hand-drawn decorative café illustrations */}
        <CafeLineArtCup className="hidden lg:block absolute top-10 left-8 w-24 h-24 text-white/20 pointer-events-none" />
        <CafeLineArtIced className="hidden lg:block absolute bottom-12 left-1/3 w-20 h-20 text-white/15 pointer-events-none" />
        <CafeLineArtCroissant className="hidden md:block absolute top-8 right-10 w-24 h-24 text-white/15 pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="lg:col-span-6 flex flex-col justify-center"
            >
              <p className="font-display font-bold text-sm uppercase tracking-[0.2em] text-white/85">
                {siteName} · Specialty Coffee &amp; Bakery
              </p>
              <h1
                className="font-display font-black uppercase tracking-tight text-white mt-3 leading-[1.02]"
                style={{
                  fontSize: 'clamp(2.5rem, 5vw, 4.25rem)',
                  textWrap: 'balance',
                }}
              >
                {tagline}
              </h1>
              <p className="mt-5 text-base sm:text-lg text-white/90 max-w-xl leading-relaxed">
                {settings?.description ||
                  'Specialty espresso, signature iced lattes, ceremonial matcha, and warm French croissants crafted fresh daily in Cairo.'}
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={() => scrollToMenuCategory('all')}
                  className="px-7 py-3.5 rounded-xl bg-white text-[#7B5FA8] hover:bg-[#F2ECF8] font-display font-extrabold uppercase tracking-wide text-sm sm:text-base transition-colors inline-flex items-center gap-2 shadow-md cursor-pointer"
                >
                  Order Now
                  <ArrowRight className="w-4 h-4" />
                </button>
                <a
                  href="#menu"
                  className="px-7 py-3.5 rounded-xl border-2 border-white/80 text-white hover:bg-white/10 font-display font-bold uppercase tracking-wide text-sm sm:text-base transition-colors"
                >
                  Explore Menu
                </a>
              </div>

              <div className="mt-8 pt-6 divider-dotted-white grid grid-cols-3 gap-4 max-w-md text-xs sm:text-sm">
                <div>
                  <div className="font-mono font-bold text-lg sm:text-xl tabular-nums">
                    {activeCategories.length || 13}
                  </div>
                  <div className="text-white/80">Menu Categories</div>
                </div>
                <div>
                  <div className="font-mono font-bold text-lg sm:text-xl tabular-nums">
                    {settings?.minOrderEgp ?? 100} EGP
                  </div>
                  <div className="text-white/80">Minimum Order</div>
                </div>
                <div>
                  <div className="font-mono font-bold text-lg sm:text-xl tabular-nums">
                    {settings?.deliveryFeeEgp ?? 35} EGP
                  </div>
                  <div className="text-white/80">Flat Delivery</div>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="lg:col-span-6 flex items-stretch"
            >
              <div className="relative w-full rounded-3xl overflow-hidden border-4 border-white/30 shadow-2xl min-h-[280px] sm:min-h-[360px] lg:h-full">
                <img
                  src={HERO_IMAGE}
                  alt="360 Café iced Spanish latte, latte art cappuccino, and golden croissant"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#28232D]/55 via-transparent to-transparent pointer-events-none" />
                <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between text-white">
                  <div>
                    <p className="text-xs uppercase tracking-widest font-semibold text-white/80">
                      House Favorite
                    </p>
                    <p className="font-display font-bold text-lg sm:text-xl">
                      360° Lavender &amp; Iced Spanish Latte
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => scrollToMenuCategory('all')}
                    className="px-4 py-2 rounded-xl bg-[#947ABD] hover:bg-[#7B5FA8] text-white text-xs font-bold uppercase tracking-wide transition-colors cursor-pointer"
                  >
                    View Menu
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        </div>

        <CircularPatternStrip fill="#FFFFFF" bg="#947ABD" />
      </section>

      {/* Popular Menu Categories Strip (KFC Egypt inspired quick category rail) */}
      <section className="py-12 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between gap-4 mb-6">
            <div>
              <h2 className="font-display font-black uppercase text-2xl sm:text-3xl tracking-tight text-[#28232D]">
                Explore Menu
              </h2>
              <p className="text-sm text-[#28232D]/65 mt-1">
                Tap any category to jump straight to your cravings.
              </p>
            </div>
            <button
              type="button"
              onClick={() => scrollToMenuCategory('all')}
              className="text-sm font-bold text-[#7B5FA8] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
            >
              View All Categories
            </button>
          </div>

          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
            {activeCategories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => scrollToMenuCategory(cat.id)}
                className="group shrink-0 w-36 sm:w-40 text-left rounded-2xl border border-[#947ABD]/15 bg-[#F2ECF8]/55 hover:bg-[#F2ECF8] hover:border-[#947ABD] p-3 transition-all cursor-pointer"
              >
                <div className="w-full aspect-[4/3] rounded-xl overflow-hidden bg-white mb-2.5">
                  <img
                    src={cat.imageUrl || HERO_IMAGE}
                    alt={cat.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
                <p className="font-display font-bold text-sm text-[#28232D] truncate">
                  {cat.name}
                </p>
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8">
        <div className="divider-dotted" />
      </div>

      {/* Featured Bestsellers Section */}
      {featuredProducts.length > 0 && (
        <section className="py-12 md:py-16 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[#7B5FA8]">
                  Barista Picks
                </p>
                <h2 className="font-display font-black uppercase text-2xl sm:text-4xl tracking-tight text-[#28232D] mt-1">
                  Signature Bestsellers
                </h2>
              </div>
              <p className="text-sm text-[#28232D]/65 max-w-md">
                Our most-ordered creations across Cairo — crafted with specialty espresso,
                house lavender, and ceremonial Uji matcha.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {featuredProducts.map((product) => {
                const effectivePrice =
                  product.promoPriceEgp !== null &&
                  product.promoPriceEgp < product.priceEgp
                    ? product.promoPriceEgp
                    : product.priceEgp;

                return (
                  <motion.div
                    key={product.id}
                    whileHover={{ y: -3 }}
                    transition={{ duration: 0.18 }}
                    className="group rounded-2xl border border-[#947ABD]/18 bg-white overflow-hidden flex flex-col shadow-xs hover:shadow-md transition-shadow"
                  >
                    <div
                      onClick={() => setActiveProduct(product)}
                      className="relative aspect-[4/3] bg-[#F2ECF8] overflow-hidden cursor-pointer"
                    >
                      {!failedImages[product.id] && product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setFailedImages((prev) => ({ ...prev, [product.id]: true }))
                          }
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[#947ABD]">
                          <Coffee className="w-10 h-10" />
                        </div>
                      )}
                    </div>

                    <div className="p-5 flex-1 flex flex-col">
                      <div className="text-xs font-semibold uppercase tracking-wider text-[#7B5FA8]">
                        {categoryNameById[product.categoryId] || 'Signature'}
                        {product.promoPriceEgp !== null &&
                          product.promoPriceEgp < product.priceEgp && (
                            <span> · Special Offer</span>
                          )}
                      </div>
                      <h3
                        onClick={() => setActiveProduct(product)}
                        className="font-display font-bold text-lg text-[#28232D] mt-1 cursor-pointer hover:text-[#7B5FA8] transition-colors"
                      >
                        {product.name}
                      </h3>
                      <p className="text-sm text-[#28232D]/70 mt-1.5 line-clamp-2 flex-1">
                        {product.description}
                      </p>

                      <div className="mt-4 pt-4 border-t border-[#947ABD]/12 flex items-center justify-between gap-3">
                        <div>
                          <span className="font-mono font-bold text-base text-[#28232D] tabular-nums">
                            {effectivePrice} EGP
                          </span>
                          {product.promoPriceEgp !== null &&
                            product.promoPriceEgp < product.priceEgp && (
                              <span className="ml-2 font-mono text-xs text-[#28232D]/45 line-through tabular-nums">
                                {product.priceEgp} EGP
                              </span>
                            )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleQuickAdd(product)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#947ABD] hover:bg-[#7B5FA8] text-white text-xs font-bold uppercase tracking-wide transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          {product.customizations.length > 0 ? 'Customize' : 'Add'}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Full Interactive Digital Menu Section */}
      <section id="menu" className="py-12 md:py-16 bg-[#F2ECF8]/45 border-t border-[#947ABD]/12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-[#7B5FA8]">
                Digital Menu
              </p>
              <h2 className="font-display font-black uppercase text-3xl sm:text-4xl tracking-tight text-[#28232D] mt-1">
                Order Online
              </h2>
            </div>

            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-[#947ABD] absolute left-3.5 top-3" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search lattes, matcha, pastries..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white border border-[#947ABD]/25 text-sm text-[#28232D] placeholder:text-[#28232D]/45 focus:outline-none focus:ring-2 focus:ring-[#947ABD]"
              />
            </div>
          </div>

          {/* Sticky Category Navigation Rail */}
          <div className="sticky top-16 md:top-20 z-30 bg-[#F2ECF8]/95 backdrop-blur-sm py-3 -mx-4 px-4 sm:mx-0 sm:px-0 border-b border-[#947ABD]/15 mb-8">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              <button
                type="button"
                onClick={() => setSelectedCategoryId('all')}
                className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  selectedCategoryId === 'all'
                    ? 'bg-[#947ABD] text-white'
                    : 'bg-white text-[#28232D]/75 hover:text-[#28232D] border border-[#947ABD]/15'
                }`}
              >
                All Items
              </button>
              {activeCategories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategoryId(cat.id)}
                  className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    selectedCategoryId === cat.id
                      ? 'bg-[#947ABD] text-white'
                      : 'bg-white text-[#28232D]/75 hover:text-[#28232D] border border-[#947ABD]/15'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-72 rounded-2xl bg-white border border-[#947ABD]/15 animate-pulse"
                />
              ))}
            </div>
          ) : groupedMenu.length === 0 ? (
            <div className="rounded-2xl bg-white border border-[#947ABD]/15 p-12 text-center">
              <Coffee className="w-10 h-10 text-[#947ABD] mx-auto mb-3" />
              <h3 className="font-display font-bold text-lg text-[#28232D]">
                No matching items found
              </h3>
              <p className="text-sm text-[#28232D]/65 mt-1">
                Try clearing your search filter or choosing another category.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategoryId('all');
                }}
                className="mt-4 px-5 py-2 rounded-xl bg-[#947ABD] text-white text-sm font-semibold"
              >
                Reset Menu Filters
              </button>
            </div>
          ) : (
            <div className="space-y-12">
              {groupedMenu.map(({ category, items }, groupIndex) => (
                <div key={category.id}>
                  {groupIndex > 0 && <div className="divider-dotted mb-10" />}
                  <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 mb-6">
                    <div>
                      <h3 className="font-display font-black uppercase text-2xl text-[#28232D]">
                        {category.name}
                      </h3>
                      {category.description && (
                        <p className="text-sm text-[#28232D]/65 mt-0.5">
                          {category.description}
                        </p>
                      )}
                    </div>
                    <span className="font-mono text-xs text-[#7B5FA8] tabular-nums shrink-0">
                      {items.length} {items.length === 1 ? 'item' : 'items'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {items.map((product) => {
                      const effectivePrice =
                        product.promoPriceEgp !== null &&
                        product.promoPriceEgp < product.priceEgp
                          ? product.promoPriceEgp
                          : product.priceEgp;

                      return (
                        <div
                          key={product.id}
                          className={`rounded-2xl bg-white border border-[#947ABD]/15 overflow-hidden flex flex-col transition-all hover:border-[#947ABD]/50 ${
                            !product.isAvailable ? 'opacity-60' : ''
                          }`}
                        >
                          <div
                            onClick={() => setActiveProduct(product)}
                            className="aspect-[4/3] bg-[#F2ECF8] overflow-hidden cursor-pointer relative"
                          >
                            {!failedImages[product.id] && product.imageUrl ? (
                              <img
                                src={product.imageUrl}
                                alt={product.name}
                                referrerPolicy="no-referrer"
                                onError={() =>
                                  setFailedImages((prev) => ({
                                    ...prev,
                                    [product.id]: true,
                                  }))
                                }
                                className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[#947ABD]">
                                <Coffee className="w-9 h-9" />
                              </div>
                            )}
                          </div>

                          <div className="p-4 sm:p-5 flex-1 flex flex-col">
                            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#7B5FA8]">
                              {category.name}
                              {!product.isAvailable && ' · Sold Out'}
                            </div>
                            <h4
                              onClick={() => setActiveProduct(product)}
                              className="font-display font-bold text-base sm:text-lg text-[#28232D] mt-1 cursor-pointer hover:text-[#7B5FA8]"
                            >
                              {product.name}
                            </h4>
                            <p className="text-xs sm:text-sm text-[#28232D]/70 mt-1 line-clamp-2 flex-1">
                              {product.description}
                            </p>

                            <div className="mt-4 pt-3 border-t border-[#947ABD]/12 flex items-center justify-between gap-3">
                              <div>
                                <span className="font-mono font-bold text-base text-[#28232D] tabular-nums">
                                  {effectivePrice} EGP
                                </span>
                                {product.promoPriceEgp !== null &&
                                  product.promoPriceEgp < product.priceEgp && (
                                    <span className="ml-2 font-mono text-xs text-[#28232D]/45 line-through tabular-nums">
                                      {product.priceEgp} EGP
                                    </span>
                                  )}
                              </div>

                              <button
                                type="button"
                                disabled={!product.isAvailable}
                                onClick={() => handleQuickAdd(product)}
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#947ABD] hover:bg-[#7B5FA8] disabled:bg-[#28232D]/25 text-white text-xs font-bold uppercase tracking-wide transition-colors cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                {product.isAvailable ? 'Add' : 'Sold Out'}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* About 360 Café Section — Purple Band with Circular Scallop & Hand-Drawn Line Art */}
      <section id="about" className="relative bg-circles-lavender text-white overflow-hidden">
        <CircularPatternStrip fill="#947ABD" bg="#FFFFFF" flip />
        <CafeLineArtCup className="hidden lg:block absolute bottom-10 right-12 w-28 h-28 text-white/15 pointer-events-none" />
        <CafeLineArtCroissant className="hidden lg:block absolute top-16 left-10 w-24 h-24 text-white/15 pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-6">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/80">
                Our Story
              </p>
              <h2 className="font-display font-black uppercase text-3xl sm:text-5xl tracking-tight mt-2 leading-tight">
                Crafted To Upgrade Your Mood
              </h2>
              <p className="mt-5 text-base text-white/90 leading-relaxed">
                {settings?.description ||
                  '360 Café brings together specialty coffee precision and warm neighborhood hospitality. From our signature Lavender Latte and Crème Brûlée espresso creations to ceremonial Uji matcha and freshly laminated croissants, every order is crafted fresh to elevate your day.'}
              </p>

              <div className="mt-8 pt-6 divider-dotted-white grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div>
                  <h3 className="font-display font-bold text-lg">Single Origin</h3>
                  <p className="text-xs text-white/80 mt-1">
                    Ethically roasted Arabica beans dialed in every morning.
                  </p>
                </div>
                <div>
                  <h3 className="font-display font-bold text-lg">Fresh Bakery</h3>
                  <p className="text-xs text-white/80 mt-1">
                    Flaky croissants, honey cake, and Lotus cups baked daily.
                  </p>
                </div>
                <div>
                  <h3 className="font-display font-bold text-lg">Fast Delivery</h3>
                  <p className="text-xs text-white/80 mt-1">
                    Order online for doorstep delivery or quick store pickup.
                  </p>
                </div>
              </div>
            </div>

            <div className="lg:col-span-6 grid grid-cols-2 gap-4">
              <div className="rounded-3xl overflow-hidden border-2 border-white/25 aspect-[4/3]">
                <img
                  src="/src/assets/images/drink_iced_coffee_1795554216864.jpg"
                  alt="360 Café iced signature lattes"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="rounded-3xl overflow-hidden border-2 border-white/25 aspect-[4/3] mt-6">
                <img
                  src="/src/assets/images/bakery_desserts_pastry_1795554218238.jpg"
                  alt="360 Café freshly baked croissants and cheesecake cups"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>
        </div>

        <CircularPatternStrip fill="#FFFFFF" bg="#947ABD" />
      </section>

      {/* Interactive Google Maps Location & Opening Hours */}
      <section id="location" className="py-16 md:py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-10">
            <p className="text-xs font-bold uppercase tracking-widest text-[#7B5FA8]">
              Visit Us
            </p>
            <h2 className="font-display font-black uppercase text-3xl sm:text-4xl tracking-tight text-[#28232D] mt-1">
              Location &amp; Opening Hours
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            <div className="lg:col-span-7">
              <CafeLocationMap
                lat={lat}
                lng={lng}
                name={siteName}
                address={address}
                openingHours={openingHours}
              />
            </div>

            <div className="lg:col-span-5 rounded-3xl bg-[#F2ECF8] border border-[#947ABD]/20 p-7 sm:p-8 flex flex-col justify-between">
              <div className="space-y-6">
                <div>
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#7B5FA8]">
                    <MapPin className="w-4 h-4" />
                    Address
                  </div>
                  <p className="text-base font-semibold text-[#28232D] mt-1.5 leading-snug">
                    {address}
                  </p>
                </div>

                <div className="divider-dotted" />

                <div>
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#7B5FA8]">
                    <Clock className="w-4 h-4" />
                    Opening Hours
                  </div>
                  <p className="text-base font-semibold text-[#28232D] mt-1.5">
                    {openingHours}
                  </p>
                </div>

                <div className="divider-dotted" />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#7B5FA8]">
                      <Phone className="w-3.5 h-3.5" />
                      Phone
                    </div>
                    <a
                      href={`tel:${settings?.phone || '+201003600360'}`}
                      className="text-sm font-mono font-semibold text-[#28232D] hover:text-[#7B5FA8] mt-1 block"
                    >
                      {settings?.phone || '+20 100 360 0360'}
                    </a>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#7B5FA8]">
                      <Mail className="w-3.5 h-3.5" />
                      Email
                    </div>
                    <a
                      href={`mailto:${settings?.email || 'hello@360-cafe.com'}`}
                      className="text-sm font-medium text-[#28232D] hover:text-[#7B5FA8] mt-1 block truncate"
                    >
                      {settings?.email || 'hello@360-cafe.com'}
                    </a>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href={directionsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#947ABD] hover:bg-[#7B5FA8] text-white font-display font-bold text-sm transition-colors whitespace-nowrap"
                >
                  <Navigation className="w-4 h-4" />
                  Get Directions
                </a>
                <button
                  type="button"
                  onClick={() => scrollToMenuCategory('all')}
                  className="px-5 py-3 rounded-xl bg-white border border-[#947ABD]/30 text-[#7B5FA8] hover:bg-white/80 font-display font-bold text-sm transition-colors whitespace-nowrap cursor-pointer"
                >
                  Order Online
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Branded Purple Footer with Repeating Circular Edge */}
      <footer id="contact" className="bg-circles-lavender text-white mt-auto">
        <CircularPatternStrip fill="#947ABD" bg="#FFFFFF" flip />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
            <div className="md:col-span-5 space-y-4">
              <CafeLogo
                variant="white"
                logoUrl={settings?.logoUrl}
                name={siteName}
                className="h-12 w-auto"
              />
              <p className="font-display font-bold uppercase tracking-wider text-sm text-white/90">
                {tagline}
              </p>
              <p className="text-sm text-white/80 max-w-sm leading-relaxed">
                {address}
              </p>
            </div>

            <div className="md:col-span-3 space-y-3">
              <h4 className="font-display font-bold uppercase text-xs tracking-widest text-white/75">
                Quick Links
              </h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href="#home" className="hover:underline">
                    Home
                  </a>
                </li>
                <li>
                  <a href="#menu" className="hover:underline">
                    Digital Menu
                  </a>
                </li>
                <li>
                  <a href="#about" className="hover:underline">
                    About 360 Café
                  </a>
                </li>
                <li>
                  <a href="#location" className="hover:underline">
                    Location &amp; Hours
                  </a>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={onNavigateAdmin}
                    className="hover:underline text-left cursor-pointer"
                  >
                    Staff &amp; Admin Dashboard
                  </button>
                </li>
              </ul>
            </div>

            <div className="md:col-span-4 space-y-3">
              <h4 className="font-display font-bold uppercase text-xs tracking-widest text-white/75">
                Hours &amp; Social
              </h4>
              <p className="text-sm text-white/90">{openingHours}</p>
              <p className="text-sm font-mono text-white/90">
                {settings?.phone || '+20 100 360 0360'}
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-2">
                {settings?.instagramUrl && (
                  <a
                    href={settings.instagramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-semibold transition-colors"
                  >
                    <Instagram className="w-4 h-4" />
                    Instagram
                  </a>
                )}
                {settings?.facebookUrl && (
                  <a
                    href={settings.facebookUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-semibold transition-colors"
                  >
                    Facebook
                  </a>
                )}
                {settings?.tiktokUrl && (
                  <a
                    href={settings.tiktokUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-semibold transition-colors"
                  >
                    TikTok
                  </a>
                )}
              </div>
            </div>
          </div>

          <div className="mt-10 pt-6 divider-dotted-white flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-white/75">
            <span>
              © {new Date().getFullYear()} {siteName}. All rights reserved.
            </span>
            <span>Interactive maps powered by Google Maps Platform</span>
          </div>
        </div>
      </footer>

      {/* Customization Modal */}
      <ProductModal
        product={activeProduct}
        categoryName={activeProduct ? categoryNameById[activeProduct.categoryId] : undefined}
        onClose={() => setActiveProduct(null)}
        onAddToCart={handleAddToCart}
      />

      {/* Slide-Over Cart & Checkout Drawer */}
      <CartDrawer
        isOpen={cartOpen}
        onClose={() => setCartOpen(false)}
        cart={cart}
        orderType={orderType}
        onOrderTypeChange={setOrderType}
        onUpdateQty={handleUpdateQty}
        onRemoveItem={(key) => setCart((prev) => prev.filter((i) => i.cartKey !== key))}
        onClearCart={() => setCart([])}
        settings={settings}
        activeTrackedOrder={trackedOrder}
        onOrderPlaced={(order) => setTrackedOrder(order)}
        onCloseTrackedOrder={() => setTrackedOrder(null)}
      />
    </div>
  );
};
