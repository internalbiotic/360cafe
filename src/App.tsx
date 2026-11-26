import React, { useCallback, useEffect, useState } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import { Category, Product, RestaurantSettings } from './types.ts';
import { Storefront } from './components/Storefront.tsx';
import { AdminDashboard } from './components/AdminDashboard.tsx';

export default function App() {
  const [route, setRoute] = useState<'storefront' | 'admin'>(() =>
    window.location.pathname.startsWith('/admin') ? 'admin' : 'storefront'
  );
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState(false);

  const mapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

  const loadStorefront = useCallback(async () => {
    try {
      const res = await fetch('/api/storefront');
      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings);
        setCategories(data.categories || []);
        setProducts(data.products || []);
      }
    } catch (err) {
      console.error('Failed to fetch storefront catalog:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStorefront();
  }, [loadStorefront]);

  useEffect(() => {
    const onPopState = () => {
      setRoute(window.location.pathname.startsWith('/admin') ? 'admin' : 'storefront');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const handleQuotaExceeded = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', handleQuotaExceeded);
  }, []);

  const navigateTo = (target: 'storefront' | 'admin') => {
    const path = target === 'admin' ? '/admin' : '/';
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
    }
    setRoute(target);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const content = (
    <div className="min-h-screen flex flex-col">
      {mapsQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {route === 'admin' ? (
        <AdminDashboard
          settings={settings}
          categories={categories}
          products={products}
          onRefreshStorefront={loadStorefront}
          onNavigateStorefront={() => navigateTo('storefront')}
        />
      ) : (
        <Storefront
          settings={settings}
          categories={categories}
          products={products}
          loading={loading}
          onNavigateAdmin={() => navigateTo('admin')}
        />
      )}
    </div>
  );

  if (mapsApiKey) {
    return (
      <APIProvider
        apiKey={mapsApiKey}
        libraries={['places', 'marker']}
        language="en"
        region="EG"
      >
        {content}
      </APIProvider>
    );
  }

  return content;
}
