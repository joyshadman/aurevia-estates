"use client";

import "leaflet/dist/leaflet.css";
import { divIcon, latLngBounds } from "leaflet";
import { useEffect, type ReactNode } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";

// Leaflet with OpenStreetMap tiles (spec 0013). Loaded only in the browser
// through `ListingMap`, so pages that show a map stay cached.

export type MapMarker = { key: string; latitude: number; longitude: number; label: string; title: string; popup?: ReactNode };

// Sylhet city centre, for a map with no markers.
const sylhet: [number, number] = [24.8949, 91.8687];

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

// A price pill. The classes are role tokens, so the pin follows the theme.
const pinIcon = (label: string) =>
  divIcon({
    className: "",
    html: `<span class="inline-block -translate-x-1/2 -translate-y-full rounded-full border border-surface-raised bg-accent px-2.5 py-1 text-xs font-medium whitespace-nowrap text-on-accent shadow-lift">${escapeHtml(label)}</span>`,
    iconSize: [0, 0],
  });

function FitToMarkers({ markers, zoom }: { markers: MapMarker[]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    if (markers.length === 0) {
      map.setView(sylhet, 12);
    } else if (markers.length === 1) {
      map.setView([markers[0].latitude, markers[0].longitude], zoom);
    } else {
      map.fitBounds(latLngBounds(markers.map((marker) => [marker.latitude, marker.longitude])), { padding: [48, 48], maxZoom: 15 });
    }
  }, [map, markers, zoom]);
  return null;
}

export default function LeafletMap({ markers, zoom = 15, className }: { markers: MapMarker[]; zoom?: number; className?: string }) {
  return (
    <MapContainer center={sylhet} zoom={12} scrollWheelZoom={false} className={className}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitToMarkers markers={markers} zoom={zoom} />
      {markers.map((marker) => (
        <Marker key={marker.key} position={[marker.latitude, marker.longitude]} icon={pinIcon(marker.label)} title={marker.title} alt={marker.title}>
          {marker.popup ? <Popup>{marker.popup}</Popup> : null}
        </Marker>
      ))}
    </MapContainer>
  );
}
