import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Coffee,
  Minus,
  Plus,
  ShoppingBag,
  Store,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { CartItem, Order, RestaurantSettings } from '../types.ts';
import { DeliveryAddressAutocomplete } from './GoogleMapsWidgets.tsx';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  orderType: 'delivery' | 'pickup';
  onOrderTypeChange: (type: 'delivery' | 'pickup') => void;
  onUpdateQty: (cartKey: string, delta: number) => void;
  onRemoveItem: (cartKey: string) => void;
  onClearCart: () => void;
  settings: RestaurantSettings | null;
  activeTrackedOrder: Order | null;
  onOrderPlaced: (order: Order) => void;
  onCloseTrackedOrder: () => void;
}

const DELIVERY_STEPS = ['New', 'Confirmed', 'Preparing', 'Out for delivery', 'Completed'];
const PICKUP_STEPS = ['New', 'Confirmed', 'Preparing', 'Ready for pickup', 'Completed'];

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  cart,
  orderType,
  onOrderTypeChange,
  onUpdateQty,
  onRemoveItem,
  onClearCart,
  settings,
  activeTrackedOrder,
  onOrderPlaced,
  onCloseTrackedOrder,
}) => {
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryCoords, setDeliveryCoords] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!activeTrackedOrder) {
      setLiveStatus(null);
      return;
    }
    setLiveStatus(activeTrackedOrder.status);

    // Connect WebSocket for real-time customer order status updates
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
    ws.onopen = () => {
      ws.send(
        JSON.stringify({ type: 'track', orderNumber: activeTrackedOrder.orderNumber })
      );
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (
          msg?.type === 'order:updated' &&
          msg.order?.orderNumber === activeTrackedOrder.orderNumber
        ) {
          setLiveStatus(msg.order.status);
        }
      } catch {
        // ignore parse errors
      }
    };
    return () => ws.close();
  }, [activeTrackedOrder]);

  const subtotal = cart.reduce((sum, item) => {
    const base =
      item.product.promoPriceEgp !== null &&
      item.product.promoPriceEgp < item.product.priceEgp
        ? item.product.promoPriceEgp
        : item.product.priceEgp;
    const extras = item.selectedCustomizations.reduce(
      (s, c) => s + c.priceDeltaEgp,
      0
    );
    return sum + (base + extras) * item.quantity;
  }, 0);

  const minOrder = settings?.minOrderEgp ?? 100;
  const deliveryFee = orderType === 'delivery' ? (settings?.deliveryFeeEgp ?? 35) : 0;
  const total = subtotal + deliveryFee;
  const belowMin = subtotal > 0 && subtotal < minOrder;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (cart.length === 0) return;
    if (belowMin) {
      setError(`Minimum order amount is ${minOrder} EGP.`);
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          orderType,
          deliveryAddress: orderType === 'delivery' ? deliveryAddress.trim() : '',
          deliveryLat: deliveryCoords?.lat ?? null,
          deliveryLng: deliveryCoords?.lng ?? null,
          specialInstructions: specialInstructions.trim(),
          items: cart.map((item) => ({
            productId: item.product.id,
            quantity: item.quantity,
            customizationIds: item.selectedCustomizations.map((c) => c.id),
          })),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data?.error || 'Could not submit order. Please check your details.');
        return;
      }

      onClearCart();
      onOrderPlaced(data);
    } catch {
      setError('Network error while submitting your order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const displayStatus = liveStatus || activeTrackedOrder?.status || 'New';
  const steps =
    activeTrackedOrder?.orderType === 'pickup' ? PICKUP_STEPS : DELIVERY_STEPS;
  const currentStepIdx = steps.indexOf(displayStatus);

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex justify-end bg-[#28232D]/50 backdrop-blur-[2px]"
        onClick={onClose}
      >
        <motion.aside
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md bg-white h-full flex flex-col shadow-2xl border-l border-[#947ABD]/15"
        >
          {/* Drawer Header */}
          <div className="px-6 py-4 bg-[#947ABD] text-white flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <ShoppingBag className="w-5 h-5" />
              <h2 className="font-display font-bold text-lg uppercase tracking-wide">
                {activeTrackedOrder ? 'Order Status' : 'Your Order Bag'}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close bag"
              className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 transition-colors flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Active Order Confirmation / Tracking View */}
          {activeTrackedOrder ? (
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              <div className="rounded-2xl bg-[#F2ECF8] p-5 border border-[#947ABD]/25 text-center">
                <CheckCircle2 className="w-10 h-10 text-[#7B5FA8] mx-auto" />
                <p className="text-xs font-semibold uppercase tracking-wider text-[#7B5FA8] mt-2">
                  Order Confirmed
                </p>
                <h3 className="font-mono font-bold text-xl text-[#28232D] mt-1">
                  {activeTrackedOrder.orderNumber}
                </h3>
                <p className="text-sm text-[#28232D]/75 mt-1">
                  Current Status:{' '}
                  <strong className="text-[#7B5FA8]">{displayStatus}</strong>
                </p>
              </div>

              {/* Status Stepper */}
              {displayStatus === 'Cancelled' ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                  This order was cancelled. Please contact {settings?.phone} if you need
                  assistance.
                </div>
              ) : (
                <div className="space-y-3">
                  <h4 className="font-display font-bold text-xs uppercase tracking-wider text-[#28232D]/60">
                    Live Kitchen Progress
                  </h4>
                  <div className="space-y-2.5">
                    {steps.map((step, idx) => {
                      const done = currentStepIdx >= idx;
                      const isCurrent = currentStepIdx === idx;
                      return (
                        <div key={step} className="flex items-center gap-3">
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono font-bold shrink-0 ${
                              done
                                ? 'bg-[#947ABD] text-white'
                                : 'bg-[#F2ECF8] text-[#947ABD]/60'
                            }`}
                          >
                            {idx + 1}
                          </div>
                          <div className="flex-1 flex items-center justify-between">
                            <span
                              className={`text-sm ${
                                isCurrent
                                  ? 'font-bold text-[#28232D]'
                                  : done
                                    ? 'font-medium text-[#28232D]'
                                    : 'text-[#28232D]/45'
                              }`}
                            >
                              {step}
                            </span>
                            {isCurrent && (
                              <span className="text-xs font-medium text-[#7B5FA8] inline-flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5" /> Active
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Receipt Summary */}
              <div className="border-t border-[#947ABD]/15 pt-4 space-y-2.5">
                <h4 className="font-display font-bold text-xs uppercase tracking-wider text-[#28232D]/60">
                  Order Summary
                </h4>
                {activeTrackedOrder.items.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm gap-3">
                    <div>
                      <span className="font-semibold text-[#28232D]">
                        {item.quantity}x {item.productName}
                      </span>
                      {item.customizations.length > 0 && (
                        <p className="text-xs text-[#28232D]/60">
                          {item.customizations.map((c) => c.optionName).join(', ')}
                        </p>
                      )}
                    </div>
                    <span className="font-mono tabular-nums text-[#28232D] shrink-0">
                      {item.lineTotalEgp} EGP
                    </span>
                  </div>
                ))}

                <div className="pt-3 border-t border-[#947ABD]/15 space-y-1 text-sm">
                  <div className="flex justify-between text-[#28232D]/70">
                    <span>Subtotal</span>
                    <span className="font-mono tabular-nums">
                      {activeTrackedOrder.subtotalEgp} EGP
                    </span>
                  </div>
                  <div className="flex justify-between text-[#28232D]/70">
                    <span>
                      {activeTrackedOrder.orderType === 'delivery'
                        ? 'Delivery Fee'
                        : 'Store Pickup'}
                    </span>
                    <span className="font-mono tabular-nums">
                      {activeTrackedOrder.deliveryFeeEgp} EGP
                    </span>
                  </div>
                  <div className="flex justify-between font-display font-bold text-base text-[#28232D] pt-1">
                    <span>Total ({activeTrackedOrder.orderType === 'delivery' ? 'Cash on Delivery' : 'Pay on Pickup'})</span>
                    <span className="font-mono tabular-nums text-[#7B5FA8]">
                      {activeTrackedOrder.totalEgp} EGP
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={onCloseTrackedOrder}
                className="w-full py-3 rounded-xl border border-[#947ABD] text-[#7B5FA8] font-display font-bold text-sm hover:bg-[#F2ECF8] transition-colors"
              >
                Start a New Order
              </button>
            </div>
          ) : cart.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-[#F2ECF8] text-[#947ABD] flex items-center justify-center mb-4">
                <Coffee className="w-8 h-8" />
              </div>
              <h3 className="font-display font-bold text-xl text-[#28232D]">
                Your bag is empty
              </h3>
              <p className="text-sm text-[#28232D]/65 mt-2 max-w-xs">
                Explore our signature drinks, iced lattes, matcha, and fresh croissants to
                upgrade your mood.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-6 px-6 py-2.5 rounded-xl bg-[#947ABD] text-white font-display font-bold text-sm hover:bg-[#7B5FA8] transition-colors"
              >
                Browse Menu
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Fulfillment Switch */}
                <div className="grid grid-cols-2 gap-2 p-1 bg-[#F2ECF8] rounded-xl">
                  <button
                    type="button"
                    onClick={() => onOrderTypeChange('delivery')}
                    className={`py-2 px-3 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${
                      orderType === 'delivery'
                        ? 'bg-white text-[#28232D] shadow-sm'
                        : 'text-[#28232D]/65 hover:text-[#28232D]'
                    }`}
                  >
                    <Truck className="w-4 h-4 text-[#947ABD]" />
                    Delivery
                  </button>
                  <button
                    type="button"
                    onClick={() => onOrderTypeChange('pickup')}
                    className={`py-2 px-3 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${
                      orderType === 'pickup'
                        ? 'bg-white text-[#28232D] shadow-sm'
                        : 'text-[#28232D]/65 hover:text-[#28232D]'
                    }`}
                  >
                    <Store className="w-4 h-4 text-[#947ABD]" />
                    Pickup
                  </button>
                </div>

                {/* Cart Items */}
                <div className="space-y-3">
                  {cart.map((item) => {
                    const base =
                      item.product.promoPriceEgp !== null &&
                      item.product.promoPriceEgp < item.product.priceEgp
                        ? item.product.promoPriceEgp
                        : item.product.priceEgp;
                    const extras = item.selectedCustomizations.reduce(
                      (s, c) => s + c.priceDeltaEgp,
                      0
                    );
                    const lineTotal = (base + extras) * item.quantity;

                    return (
                      <div
                        key={item.cartKey}
                        className="flex gap-3 pb-3 border-b border-[#947ABD]/12"
                      >
                        <img
                          src={item.product.imageUrl}
                          alt={item.product.name}
                          referrerPolicy="no-referrer"
                          className="w-16 h-16 rounded-xl object-cover bg-[#F2ECF8] shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="font-display font-bold text-sm text-[#28232D] truncate">
                              {item.product.name}
                            </h4>
                            <button
                              type="button"
                              onClick={() => onRemoveItem(item.cartKey)}
                              aria-label={`Remove ${item.product.name}`}
                              className="text-[#28232D]/40 hover:text-red-600 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          {item.selectedCustomizations.length > 0 && (
                            <p className="text-xs text-[#28232D]/60 mt-0.5 line-clamp-2">
                              {item.selectedCustomizations
                                .map((c) => c.optionName)
                                .join(' · ')}
                            </p>
                          )}
                          <div className="flex items-center justify-between mt-2">
                            <div className="inline-flex items-center gap-1.5 bg-[#F2ECF8] rounded-lg px-1.5 py-0.5">
                              <button
                                type="button"
                                onClick={() => onUpdateQty(item.cartKey, -1)}
                                aria-label="Decrease item quantity"
                                className="w-6 h-6 flex items-center justify-center rounded hover:bg-white transition-colors"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <span className="font-mono text-xs font-semibold px-1 tabular-nums">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => onUpdateQty(item.cartKey, 1)}
                                aria-label="Increase item quantity"
                                className="w-6 h-6 flex items-center justify-center rounded hover:bg-white transition-colors"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <span className="font-mono font-semibold text-sm text-[#7B5FA8] tabular-nums">
                              {lineTotal} EGP
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Customer Checkout Form */}
                <div className="space-y-3 pt-1">
                  <h4 className="font-display font-bold text-xs uppercase tracking-wider text-[#28232D]/65">
                    Customer Details
                  </h4>
                  <div>
                    <label className="block text-xs font-medium text-[#28232D]/75 mb-1">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Your name"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#947ABD]/25 text-sm focus:outline-none focus:ring-2 focus:ring-[#947ABD]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#28232D]/75 mb-1">
                      Mobile Number *
                    </label>
                    <input
                      type="tel"
                      required
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="+20 1XX XXX XXXX"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#947ABD]/25 text-sm focus:outline-none focus:ring-2 focus:ring-[#947ABD]"
                    />
                  </div>
                  {orderType === 'delivery' && (
                    <div>
                      <label className="block text-xs font-medium text-[#28232D]/75 mb-1">
                        Delivery Address *
                      </label>
                      <DeliveryAddressAutocomplete
                        value={deliveryAddress}
                        onChange={(addr, coords) => {
                          setDeliveryAddress(addr);
                          if (coords) setDeliveryCoords(coords);
                        }}
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-[#28232D]/75 mb-1">
                      Special Instructions (Optional)
                    </label>
                    <textarea
                      rows={2}
                      value={specialInstructions}
                      onChange={(e) => setSpecialInstructions(e.target.value)}
                      placeholder="Less ice, extra napkins, gate code..."
                      className="w-full px-3.5 py-2 rounded-xl border border-[#947ABD]/25 text-sm focus:outline-none focus:ring-2 focus:ring-[#947ABD]"
                    />
                  </div>

                  <div className="rounded-xl bg-[#F2ECF8] px-3.5 py-2.5 text-xs text-[#28232D]/80 flex items-center justify-between">
                    <span>Payment Method</span>
                    <strong className="text-[#7B5FA8]">
                      {orderType === 'delivery' ? 'Cash on Delivery' : 'Pay on Pickup'}
                    </strong>
                  </div>
                </div>

                {belowMin && (
                  <div className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-xs text-amber-900">
                    Add <strong>{minOrder - subtotal} EGP</strong> more to meet the{' '}
                    {minOrder} EGP minimum order requirement.
                  </div>
                )}

                {error && (
                  <div className="rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs text-red-700">
                    {error}
                  </div>
                )}
              </div>

              {/* Totals & Submit Footer */}
              <div className="p-5 bg-[#F2ECF8]/60 border-t border-[#947ABD]/15 space-y-3 shrink-0">
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between text-[#28232D]/70">
                    <span>Subtotal</span>
                    <span className="font-mono tabular-nums">{subtotal} EGP</span>
                  </div>
                  <div className="flex justify-between text-[#28232D]/70">
                    <span>{orderType === 'delivery' ? 'Delivery Fee' : 'Pickup'}</span>
                    <span className="font-mono tabular-nums">{deliveryFee} EGP</span>
                  </div>
                  <div className="flex justify-between font-display font-bold text-base text-[#28232D] pt-1">
                    <span>Total</span>
                    <span className="font-mono tabular-nums text-[#7B5FA8]">
                      {total} EGP
                    </span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting || belowMin}
                  className="w-full py-3.5 rounded-xl bg-[#947ABD] hover:bg-[#7B5FA8] disabled:opacity-50 text-white font-display font-bold text-base transition-colors cursor-pointer"
                >
                  {submitting ? 'Confirming Order...' : `Place Order · ${total} EGP`}
                </button>
              </div>
            </form>
          )}
        </motion.aside>
      </div>
    </AnimatePresence>
  );
};
