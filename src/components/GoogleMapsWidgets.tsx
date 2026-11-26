import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
  useApiIsLoaded,
  useApiLoadingStatus,
  APILoadingStatus,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { MapPin, Navigation } from 'lucide-react';

interface CafeLocationMapProps {
  lat: number;
  lng: number;
  name: string;
  address: string;
  openingHours: string;
  interactivePick?: boolean;
  onPickCoordinates?: (coords: { lat: number; lng: number }) => void;
  heightClass?: string;
}

export const CafeLocationMap: React.FC<CafeLocationMapProps> = ({
  lat,
  lng,
  name,
  address,
  openingHours,
  interactivePick = false,
  onPickCoordinates,
  heightClass = 'h-[360px] lg:h-full min-h-[340px]',
}) => {
  const isLoaded = useApiIsLoaded();
  const status = useApiLoadingStatus();
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [infoOpen, setInfoOpen] = useState(true);

  const hasApiKey = Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY);
  const position = { lat, lng };
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    `${lat},${lng}`
  )}`;

  if (!hasApiKey || status === APILoadingStatus.FAILED || status === APILoadingStatus.AUTH_FAILURE) {
    return (
      <div
        className={`relative w-full ${heightClass} rounded-3xl bg-[#F2ECF8] border border-[#947ABD]/25 flex flex-col items-center justify-center p-6 text-center`}
      >
        <div className="w-12 h-12 rounded-2xl bg-[#947ABD] text-white flex items-center justify-center mb-3">
          <MapPin className="w-6 h-6" />
        </div>
        <h4 className="font-display font-bold text-lg text-[#28232D]">{name}</h4>
        <p className="text-sm text-[#28232D]/75 max-w-sm mt-1">{address}</p>
        <p className="text-xs font-mono text-[#7B5FA8] mt-2 tabular-nums">
          {lat.toFixed(5)}, {lng.toFixed(5)}
        </p>
        <a
          href={directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#947ABD] text-white text-sm font-semibold hover:bg-[#7B5FA8] transition-colors"
        >
          <Navigation className="w-4 h-4" />
          Open in Google Maps
        </a>
      </div>
    );
  }

  return (
    <div className={`relative w-full ${heightClass} rounded-3xl overflow-hidden border border-[#947ABD]/20 bg-[#F2ECF8]`}>
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-[#7B5FA8] font-medium">
          Loading interactive map...
        </div>
      )}
      <GoogleMap
        mapId="DEMO_MAP_ID"
        center={position}
        defaultZoom={15}
        gestureHandling="greedy"
        disableDefaultUI={false}
        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        style={{ width: '100%', height: '100%' }}
        onClick={(ev) => {
          if (interactivePick && onPickCoordinates && ev.detail.latLng) {
            onPickCoordinates({
              lat: Number(ev.detail.latLng.lat.toFixed(6)),
              lng: Number(ev.detail.latLng.lng.toFixed(6)),
            });
          }
        }}
      >
        <AdvancedMarker
          ref={markerRef}
          position={position}
          title={name}
          onClick={() => setInfoOpen((prev) => !prev)}
        >
          <Pin background="#947ABD" borderColor="#28232D" glyphColor="#FFFFFF" scale={1.15} />
        </AdvancedMarker>

        {!interactivePick && infoOpen && marker && (
          <InfoWindow
            anchor={marker}
            maxWidth={260}
            onCloseClick={() => setInfoOpen(false)}
          >
            <div className="p-1 text-[#28232D]">
              <p className="font-display font-bold text-sm">{name}</p>
              <p className="text-xs text-[#28232D]/75 mt-0.5 leading-snug">{address}</p>
              <p className="text-[11px] font-medium text-[#7B5FA8] mt-1">{openingHours}</p>
              <a
                href={directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-[#7B5FA8] hover:underline"
              >
                Get Directions
              </a>
            </div>
          </InfoWindow>
        )}
      </GoogleMap>
    </div>
  );
};

interface PlacePredictionItem {
  text: { text: string };
  toPlace: () => {
    fetchFields: (opts: { fields: string[] }) => Promise<void>;
    formattedAddress?: string;
    location?: { lat: () => number; lng: () => number };
  };
}

interface AutocompleteSuggestionItem {
  placePrediction?: PlacePredictionItem;
}

/**
 * Modern Places API (New) Autocomplete hook using AutocompleteSessionToken
 * and AutocompleteSuggestion.fetchAutocompleteSuggestions.
 */
function usePlacesAutocompleteSuggestions(
  inputString: string,
  enabled: boolean
) {
  const placesLib = useMapsLibrary('places') as
    | {
        AutocompleteSessionToken: new () => unknown;
        AutocompleteSuggestion: {
          fetchAutocompleteSuggestions: (req: {
            input: string;
            sessionToken: unknown;
            includedRegionCodes?: string[];
          }) => Promise<{ suggestions?: AutocompleteSuggestionItem[] }>;
        };
      }
    | null;
  const sessionTokenRef = useRef<unknown>(null);
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestionItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !placesLib) return;

    const trimmed = inputString.trim();
    if (trimmed.length < 3) {
      setSuggestions([]);
      return;
    }

    const { AutocompleteSessionToken, AutocompleteSuggestion } = placesLib;
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = new AutocompleteSessionToken();
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: trimmed,
          sessionToken: sessionTokenRef.current,
          includedRegionCodes: ['eg'],
        });
        if (!cancelled) {
          setSuggestions(res?.suggestions || []);
        }
      } catch (err: unknown) {
        const msg = String((err as { message?: string })?.message || err || '');
        const status = (err as { status?: number })?.status;
        if (
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('Quota') ||
          msg.includes('OVER_QUERY_LIMIT') ||
          status === 429
        ) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }, 260);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [placesLib, inputString, enabled]);

  const resetSession = useCallback(() => {
    sessionTokenRef.current = null;
    setSuggestions([]);
  }, []);

  return { placesLib, suggestions, isLoading, resetSession };
}

interface DeliveryAddressAutocompleteProps {
  value: string;
  onChange: (address: string, coords?: { lat: number; lng: number } | null) => void;
  placeholder?: string;
}

export const DeliveryAddressAutocomplete: React.FC<DeliveryAddressAutocompleteProps> = ({
  value,
  onChange,
  placeholder = 'Street, building, floor, or neighborhood (Cairo / Giza / El Obour)',
}) => {
  const hasApiKey = Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const { placesLib, suggestions, isLoading, resetSession } =
    usePlacesAutocompleteSuggestions(value, hasApiKey && dropdownOpen);

  const handleSelectSuggestion = async (suggestion: AutocompleteSuggestionItem) => {
    if (!placesLib || !suggestion.placePrediction) return;
    try {
      const place = suggestion.placePrediction.toPlace();
      await place.fetchFields({
        fields: ['formattedAddress', 'location'],
      });
      const formatted =
        place.formattedAddress || suggestion.placePrediction.text.text || value;
      const loc = place.location;
      onChange(
        formatted,
        loc ? { lat: loc.lat(), lng: loc.lng() } : null
      );
      setDropdownOpen(false);
      resetSession();
    } catch (err: unknown) {
      const msg = String((err as { message?: string })?.message || err || '');
      if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('Quota')) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
      onChange(suggestion.placePrediction.text.text || value, null);
      setDropdownOpen(false);
      resetSession();
    }
  };

  return (
    <div className="relative">
      <div className="relative">
        <MapPin className="w-4 h-4 text-[#947ABD] absolute left-3.5 top-3.5 pointer-events-none" />
        <input
          type="text"
          value={value}
          onFocus={() => setDropdownOpen(true)}
          onChange={(e) => {
            setDropdownOpen(true);
            onChange(e.target.value, null);
          }}
          placeholder={placeholder}
          required
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#947ABD]/25 bg-white text-sm text-[#28232D] placeholder:text-[#28232D]/40 focus:outline-none focus:ring-2 focus:ring-[#947ABD]"
        />
      </div>

      {dropdownOpen && suggestions.length > 0 && (
        <ul className="absolute z-40 mt-1.5 w-full bg-white rounded-xl border border-[#947ABD]/25 shadow-lg max-h-56 overflow-y-auto divide-y divide-[#947ABD]/10">
          {suggestions.map((s, idx) => (
            <li key={idx}>
              <button
                type="button"
                onClick={() => handleSelectSuggestion(s)}
                className="w-full text-left px-3.5 py-2.5 text-xs sm:text-sm text-[#28232D] hover:bg-[#F2ECF8] transition-colors flex items-start gap-2.5"
              >
                <MapPin className="w-4 h-4 text-[#947ABD] shrink-0 mt-0.5" />
                <span>{s.placePrediction?.text.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {isLoading && dropdownOpen && (
        <p className="text-[11px] text-[#7B5FA8] mt-1">Searching places...</p>
      )}
    </div>
  );
};
