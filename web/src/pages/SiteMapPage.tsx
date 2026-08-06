import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { listAssetTypes } from "../api/assetTypes";
import { listAssetsAsGeoJson, updateAssetGeometry } from "../api/assets";
import { ApiError } from "../api/client";
import { getSite } from "../api/sites";
import type { Asset, AssetType, GeoJsonGeometry, Site } from "../api/types";
import { AssetDetailPanel } from "../components/AssetDetailPanel";
import { AssetFormPanel } from "../components/AssetFormPanel";

const DEFAULT_CENTER: [number, number] = [39.8, -98.5]; // continental US - no real default until a site sets one
const DEFAULT_ZOOM = 4;
const DEFAULT_COLOR = "#00A15D"; // WorkLoad primary green, used when an asset type has no color set

type DrawShape = "Marker" | "Line" | "Polygon";

// The concrete Leaflet layer types L.geoJSON() actually produces - each one
// has both toGeoJSON() (native Leaflet, per-class in @types/leaflet, not on
// the base Layer interface) and .pm (added by leaflet-geoman's module
// augmentation, likewise not on the base Layer interface). onEachFeature's
// `layer` param and pm:create's `e.layer` are both statically typed as the
// generic L.Layer, so every use site needs this cast once.
type MapFeatureLayer = L.Marker | L.Polyline | L.Polygon | L.CircleMarker;

// A plain L.marker with a colored dot divIcon, not L.circleMarker - Geoman's
// edit/drag mode calls into Leaflet's Draggable, which toggles a CSS class
// on the dragged element via plain string .className. An SVG element's
// .className is an SVGAnimatedString instead (.className.baseVal), which
// throws inside Leaflet's internals during drag. Markers render as a plain
// HTML div/img, sidestepping that entirely - the standard choice for
// interactive/draggable points in Leaflet for exactly this reason.
function coloredDotIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: "asset-dot-icon",
    html: `<span style="background:${color}"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function drawShapesFor(allowed: string[]): { shape: DrawShape; label: string }[] {
  const shapes: { shape: DrawShape; label: string }[] = [];
  if (allowed.includes("Point")) shapes.push({ shape: "Marker", label: "Point" });
  if (allowed.includes("LineString") || allowed.includes("MultiLineString")) {
    shapes.push({ shape: "Line", label: "Line" });
  }
  if (allowed.includes("Polygon") || allowed.includes("MultiPolygon")) {
    shapes.push({ shape: "Polygon", label: "Polygon" });
  }
  return shapes;
}

// The draw tool always produces a single Polygon/LineString - when an asset
// type only allows the Multi* form (spec 2.1: one geometry column, mixed
// types), wrap it into a one-part Multi geometry so the trigger's
// allowed_geom_types check passes.
function toAllowedGeometry(drawn: GeoJsonGeometry, allowed: string[]): GeoJsonGeometry {
  if (drawn.type === "Polygon" && !allowed.includes("Polygon") && allowed.includes("MultiPolygon")) {
    return { type: "MultiPolygon", coordinates: [drawn.coordinates] };
  }
  if (drawn.type === "LineString" && !allowed.includes("LineString") && allowed.includes("MultiLineString")) {
    return { type: "MultiLineString", coordinates: [drawn.coordinates] };
  }
  return drawn;
}

export function SiteMapPage() {
  const { siteId } = useParams<{ siteId: string }>();

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const assetsLayerRef = useRef<L.GeoJSON | null>(null);
  const layerByAssetId = useRef(new Map<string, MapFeatureLayer>());
  const pendingDrawnLayerRef = useRef<L.Layer | null>(null);

  const [site, setSite] = useState<Site | null>(null);
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const [drawTypeId, setDrawTypeId] = useState("");
  const [isDrawing, setIsDrawing] = useState(false);
  const [pendingCreate, setPendingCreate] = useState<{ assetType: AssetType; geometry: GeoJsonGeometry } | null>(
    null,
  );

  // Sourced straight from the last fetched FeatureCollection, not re-derived
  // from Leaflet layer state - the layers themselves get mutated in place
  // while Geoman's edit mode is active, which would make a live re-read
  // both stale-feeling and expensive to recompute on every render.
  const [assetsById, setAssetsById] = useState<Map<string, Asset>>(new Map());
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [editingGeometryAssetId, setEditingGeometryAssetId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const assetTypesById = useMemo(() => new Map(assetTypes.map((t) => [t.id, t])), [assetTypes]);
  const activeAssetTypes = useMemo(() => assetTypes.filter((t) => t.is_active), [assetTypes]);
  const drawType = drawTypeId ? assetTypesById.get(drawTypeId) : undefined;

  // Site + asset types, loaded once per siteId.
  useEffect(() => {
    if (!siteId) return;
    Promise.all([getSite(siteId), listAssetTypes({ limit: 200, sort: "code", order: "asc" })])
      .then(([siteRes, typesRes]) => {
        setSite(siteRes);
        setAssetTypes(typesRes.data);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load site"));
  }, [siteId]);

  // Leaflet map, created once and torn down on unmount.
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 20,
    }).addTo(map);
    map.pm.setGlobalOptions({ continueDrawing: false });

    mapRef.current = map;
    setMapReady(true);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Apply site.default_zoom once the site loads, if the map hasn't been
  // moved by an assets fitBounds yet.
  useEffect(() => {
    if (site?.default_zoom && mapRef.current) {
      mapRef.current.setZoom(site.default_zoom);
    }
  }, [site]);

  // Load/reload the assets layer.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !siteId || !mapReady) return;

    let cancelled = false;
    listAssetsAsGeoJson(siteId, { limit: 1000 }).then((fc) => {
      if (cancelled) return;

      if (assetsLayerRef.current) map.removeLayer(assetsLayerRef.current);
      layerByAssetId.current.clear();

      const layer = L.geoJSON(fc as unknown as GeoJSON.FeatureCollection, {
        pointToLayer: (feature, latlng) => {
          const asset = feature.properties as Asset;
          const color = assetTypesById.get(asset.asset_type_id)?.color ?? DEFAULT_COLOR;
          return L.marker(latlng, { icon: coloredDotIcon(color) });
        },
        style: (feature) => {
          const asset = feature!.properties as Asset;
          const color = assetTypesById.get(asset.asset_type_id)?.color ?? DEFAULT_COLOR;
          return { color, weight: 3 };
        },
        onEachFeature: (feature, featureLayer) => {
          const asset = feature.properties as Asset;
          layerByAssetId.current.set(asset.id, featureLayer as MapFeatureLayer);
          featureLayer.bindTooltip(`${asset.tag} — ${asset.name}`);
          featureLayer.on("click", () => setSelectedAssetId(asset.id));
        },
      });

      layer.addTo(map);
      assetsLayerRef.current = layer;
      setAssetsById(new Map(fc.features.map((f) => [f.properties.id, f.properties])));

      if (fc.features.length > 0 && refreshKey === 0) {
        // Only auto-fit on first load - a background refresh after
        // creating/editing an asset shouldn't yank the view the user set.
        map.fitBounds(layer.getBounds(), { maxZoom: 18, padding: [40, 40] });
      }
    });

    return () => {
      cancelled = true;
    };
    // refreshKey is the deliberate re-run trigger; assetTypesById changing
    // (e.g. a color edited elsewhere) re-styling the layer is a bonus, not
    // the primary reason this effect re-runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, mapReady, refreshKey, assetTypesById]);

  // Geoman draw-complete handler - re-registered whenever the selected draw
  // type changes so the closure always has the current type.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    function handleCreate(e: { layer: L.Layer; shape: string }) {
      if (!drawType) {
        map!.removeLayer(e.layer);
        return;
      }
      const geoJsonLayer = e.layer as MapFeatureLayer;
      const feature = geoJsonLayer.toGeoJSON();
      const geometry = toAllowedGeometry(feature.geometry as GeoJsonGeometry, drawType.allowed_geom_types);
      pendingDrawnLayerRef.current = e.layer;
      setIsDrawing(false);
      setPendingCreate({ assetType: drawType, geometry });
    }

    map.on("pm:create", handleCreate);
    return () => {
      map.off("pm:create", handleCreate);
    };
  }, [mapReady, drawType]);

  function startDraw(shape: DrawShape) {
    const map = mapRef.current;
    if (!map) return;
    setIsDrawing(true);
    map.pm.enableDraw(shape);
  }

  function cancelDraw() {
    mapRef.current?.pm.disableDraw();
    setIsDrawing(false);
  }

  function cancelPendingCreate() {
    if (pendingDrawnLayerRef.current && mapRef.current) {
      mapRef.current.removeLayer(pendingDrawnLayerRef.current);
    }
    pendingDrawnLayerRef.current = null;
    setPendingCreate(null);
  }

  function handleCreated() {
    if (pendingDrawnLayerRef.current && mapRef.current) {
      mapRef.current.removeLayer(pendingDrawnLayerRef.current);
    }
    pendingDrawnLayerRef.current = null;
    setPendingCreate(null);
    setDrawTypeId("");
    setRefreshKey((k) => k + 1);
  }

  function startEditGeometry() {
    if (!selectedAssetId) return;
    const layer = layerByAssetId.current.get(selectedAssetId);
    if (!layer) return;
    layer.pm.enable();
    setEditingGeometryAssetId(selectedAssetId);
  }

  function cancelEditGeometry() {
    layerByAssetId.current.get(editingGeometryAssetId ?? "")?.pm.disable();
    setEditingGeometryAssetId(null);
    setRefreshKey((k) => k + 1); // discard any unsaved drag by reloading from the server
  }

  async function saveEditedGeometry() {
    if (!editingGeometryAssetId) return;
    const layer = layerByAssetId.current.get(editingGeometryAssetId);
    if (!layer) return;
    const geometry = layer.toGeoJSON().geometry as GeoJsonGeometry;
    layer.pm.disable();
    await updateAssetGeometry(editingGeometryAssetId, geometry);
    setEditingGeometryAssetId(null);
    setRefreshKey((k) => k + 1);
  }

  const selectedAsset = selectedAssetId ? assetsById.get(selectedAssetId) : undefined;

  return (
    <div>
      <div className="page-header">
        <h1>
          <Link to="/sites">Sites</Link> / {site?.name ?? "…"}
        </h1>
      </div>

      {loadError && <p className="error">{loadError}</p>}

      <div className="map-page-layout">
        <div className="map-toolbar card">
          <h3>Add asset</h3>
          <label>
            Asset type
            <select value={drawTypeId} onChange={(e) => setDrawTypeId(e.target.value)}>
              <option value="">Select a type…</option>
              {activeAssetTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>

          {drawType && (
            <div className="map-draw-buttons">
              {drawShapesFor(drawType.allowed_geom_types).map(({ shape, label }) => (
                <button
                  key={shape}
                  type="button"
                  className={isDrawing ? "button-secondary" : ""}
                  onClick={() => startDraw(shape)}
                  disabled={isDrawing}
                >
                  Draw {label}
                </button>
              ))}
              {isDrawing && (
                <button type="button" className="button-secondary" onClick={cancelDraw}>
                  Cancel drawing
                </button>
              )}
            </div>
          )}

          {activeAssetTypes.length === 0 && (
            <p className="muted">
              No active asset types yet. <Link to="/asset-types">Add one</Link> to start placing assets.
            </p>
          )}
        </div>

        <div ref={mapContainerRef} className="map-container" />
      </div>

      {pendingCreate && siteId && (
        <AssetFormPanel
          siteId={siteId}
          assetType={pendingCreate.assetType}
          geometry={pendingCreate.geometry}
          onCancel={cancelPendingCreate}
          onCreated={handleCreated}
        />
      )}

      {selectedAssetId && (
        <AssetDetailPanel
          assetId={selectedAssetId}
          assetType={selectedAsset ? assetTypesById.get(selectedAsset.asset_type_id) : undefined}
          isEditingGeometry={editingGeometryAssetId === selectedAssetId}
          onClose={() => {
            setSelectedAssetId(null);
            if (editingGeometryAssetId) cancelEditGeometry();
          }}
          onChanged={() => setRefreshKey((k) => k + 1)}
          onDeleted={() => {
            setSelectedAssetId(null);
            setRefreshKey((k) => k + 1);
          }}
          onStartEditGeometry={startEditGeometry}
          onSaveGeometry={saveEditedGeometry}
          onCancelEditGeometry={cancelEditGeometry}
        />
      )}
    </div>
  );
}
