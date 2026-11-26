import React, { useEffect, useMemo, useState } from 'react';
import { Coffee, Minus, Plus, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Product, ProductCustomization } from '../types.ts';

interface ProductModalProps {
  product: Product | null;
  categoryName?: string;
  onClose: () => void;
  onAddToCart: (
    product: Product,
    quantity: number,
    selectedCustomizations: ProductCustomization[]
  ) => void;
}

export const ProductModal: React.FC<ProductModalProps> = ({
  product,
  categoryName,
  onClose,
  onAddToCart,
}) => {
  const [quantity, setQuantity] = useState(1);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [imgError, setImgError] = useState(false);

  const grouped = useMemo(() => {
    if (!product) return [];
    const groups: Record<
      string,
      { groupName: string; isMultiSelect: boolean; options: ProductCustomization[] }
    > = {};

    for (const c of product.customizations) {
      if (!groups[c.groupName]) {
        groups[c.groupName] = {
          groupName: c.groupName,
          isMultiSelect: c.isMultiSelect,
          options: [],
        };
      }
      groups[c.groupName].options.push(c);
    }
    return Object.values(groups);
  }, [product]);

  useEffect(() => {
    if (!product) return;
    setQuantity(1);
    setImgError(false);

    // Preselect first option of required or single-select groups
    const defaults: number[] = [];
    for (const grp of grouped) {
      if (!grp.isMultiSelect && grp.options.length > 0) {
        const requiredOrZero =
          grp.options.find((o) => o.priceDeltaEgp === 0) || grp.options[0];
        defaults.push(requiredOrZero.id);
      }
    }
    setSelectedIds(defaults);
  }, [product, grouped]);

  if (!product) return null;

  const basePrice =
    product.promoPriceEgp !== null && product.promoPriceEgp < product.priceEgp
      ? product.promoPriceEgp
      : product.priceEgp;

  const selectedCustomizations = product.customizations.filter((c) =>
    selectedIds.includes(c.id)
  );
  const extrasTotal = selectedCustomizations.reduce(
    (sum, c) => sum + c.priceDeltaEgp,
    0
  );
  const unitTotal = basePrice + extrasTotal;
  const lineTotal = unitTotal * quantity;

  const handleToggleOption = (
    group: { groupName: string; isMultiSelect: boolean; options: ProductCustomization[] },
    option: ProductCustomization
  ) => {
    if (group.isMultiSelect) {
      setSelectedIds((prev) =>
        prev.includes(option.id)
          ? prev.filter((id) => id !== option.id)
          : [...prev, option.id]
      );
    } else {
      const groupOptionIds = new Set(group.options.map((o) => o.id));
      setSelectedIds((prev) => [
        ...prev.filter((id) => !groupOptionIds.has(id)),
        option.id,
      ]);
    }
  };

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#28232D]/55 backdrop-blur-[2px] p-0 sm:p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.98 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="w-full sm:max-w-xl bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl border border-[#947ABD]/15 max-h-[92vh] flex flex-col"
        >
          {/* Product Image Header */}
          <div className="relative h-56 sm:h-64 bg-[#F2ECF8] shrink-0">
            {!imgError && product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt={product.name}
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-[#947ABD]">
                <Coffee className="w-12 h-12 opacity-60" />
                <span className="mt-2 text-xs font-medium">{product.name}</span>
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close product customization"
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/95 text-[#28232D] hover:bg-[#947ABD] hover:text-white transition-colors flex items-center justify-center shadow-md"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 overflow-y-auto flex-1 space-y-5">
            <div>
              {categoryName && (
                <p className="text-xs font-semibold uppercase tracking-wider text-[#7B5FA8]">
                  {categoryName}
                </p>
              )}
              <div className="flex items-start justify-between gap-4 mt-1">
                <h3 className="font-display font-extrabold text-2xl text-[#28232D] leading-tight">
                  {product.name}
                </h3>
                <div className="text-right shrink-0">
                  <span className="font-mono font-semibold text-lg text-[#7B5FA8] tabular-nums">
                    {basePrice} EGP
                  </span>
                  {product.promoPriceEgp !== null &&
                    product.promoPriceEgp < product.priceEgp && (
                      <div className="text-xs font-mono text-[#28232D]/45 line-through tabular-nums">
                        {product.priceEgp} EGP
                      </div>
                    )}
                </div>
              </div>
              <p className="text-sm text-[#28232D]/75 mt-2 leading-relaxed">
                {product.description}
              </p>
            </div>

            {grouped.length > 0 && (
              <div className="space-y-4 pt-2 border-t border-[#947ABD]/15">
                {grouped.map((group) => (
                  <div key={group.groupName}>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-display font-bold text-sm uppercase tracking-wide text-[#28232D]">
                        {group.groupName}
                      </h4>
                      <span className="text-xs text-[#28232D]/55">
                        {group.isMultiSelect ? 'Optional add-ons' : 'Choose 1'}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {group.options.map((opt) => {
                        const checked = selectedIds.includes(opt.id);
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => handleToggleOption(group, opt)}
                            className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-left text-sm transition-colors ${
                              checked
                                ? 'border-[#947ABD] bg-[#F2ECF8] text-[#28232D] font-semibold'
                                : 'border-[#28232D]/12 bg-white text-[#28232D]/80 hover:border-[#947ABD]/50'
                            }`}
                          >
                            <span className="truncate pr-2">{opt.optionName}</span>
                            <span className="font-mono text-xs text-[#7B5FA8] tabular-nums shrink-0">
                              {opt.priceDeltaEgp > 0 ? `+${opt.priceDeltaEgp} EGP` : 'Included'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sticky Footer Action */}
          <div className="p-4 sm:px-6 sm:py-4 bg-[#F2ECF8]/60 border-t border-[#947ABD]/15 flex items-center justify-between gap-4 shrink-0">
            <div className="flex items-center gap-2 bg-white border border-[#947ABD]/25 rounded-xl p-1">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                aria-label="Decrease quantity"
                className="w-9 h-9 rounded-lg flex items-center justify-center text-[#28232D] hover:bg-[#F2ECF8] transition-colors"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="w-8 text-center font-mono font-semibold text-sm tabular-nums">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(25, q + 1))}
                aria-label="Increase quantity"
                className="w-9 h-9 rounded-lg flex items-center justify-center text-[#28232D] hover:bg-[#F2ECF8] transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              disabled={!product.isAvailable}
              onClick={() => {
                onAddToCart(product, quantity, selectedCustomizations);
                onClose();
              }}
              className="flex-1 py-3 px-5 rounded-xl bg-[#947ABD] hover:bg-[#7B5FA8] disabled:opacity-50 text-white font-display font-bold text-sm sm:text-base transition-colors flex items-center justify-center gap-3 shadow-sm cursor-pointer"
            >
              <span>{product.isAvailable ? 'Add to Order' : 'Currently Unavailable'}</span>
              <span className="font-mono tabular-nums">{lineTotal} EGP</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
