// The map: OpenStreetMap tiles, user location, route lines, incident pins.
import React, { forwardRef, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  Marker,
  NativeUserLocation,
  type CameraRef,
} from '@maplibre/maplibre-react-native';
import type { Incident, LatLng, Route } from '../api';
import { DEFAULT_CENTER, MAP_STYLES } from '../config';
import { typeOf } from '../catalog';
import { useSettings } from '../state/settings';

type Props = {
  navigating: boolean;
  routes: Route[];
  selectedRouteId: string | null;
  onSelectRoute?: (id: string) => void;
  incidents: Incident[];
  onIncidentPress: (inc: Incident) => void;
  destination: LatLng | null;
  onLongPress?: (p: LatLng) => void;
  onAreaChange?: (bounds: [number, number, number, number]) => void;
  bottomInset: number;
};

export const ElooMap = forwardRef<CameraRef, Props>(function ElooMap(
  { navigating, routes, selectedRouteId, onSelectRoute, incidents, onIncidentPress, destination, onLongPress, onAreaChange, bottomInset },
  cameraRef,
) {
  const { scheme, c, map3d } = useSettings();

  const routeData = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      // Selected route last so it draws on top.
      features: [...routes]
        .sort((a, b) => Number(a.id === selectedRouteId) - Number(b.id === selectedRouteId))
        .map((r) => ({
          type: 'Feature',
          id: r.id,
          properties: { id: r.id, selected: r.id === selectedRouteId },
          geometry: r.geometry,
        })),
    }),
    [routes, selectedRouteId],
  );

  return (
    <Map
      style={StyleSheet.absoluteFill}
      mapStyle={scheme === 'dark' ? MAP_STYLES.dark : MAP_STYLES.light}
      logo={false}
      attribution
      attributionPosition={{ bottom: bottomInset + 8, left: 8 }}
      compass={!navigating}
      compassPosition={{ top: 120, right: 16 }}
      onLongPress={(e) => onLongPress?.({ lng: e.nativeEvent.lngLat[0], lat: e.nativeEvent.lngLat[1] })}
      onRegionDidChange={(e) => onAreaChange?.(e.nativeEvent.bounds)}
    >
      {navigating ? (
        <Camera
          ref={cameraRef}
          trackUserLocation="course"
          zoom={17}
          pitch={map3d ? 55 : 0}
          padding={{ top: 160, bottom: bottomInset + 40, left: 0, right: 0 }}
          duration={600}
        />
      ) : (
        <Camera ref={cameraRef} initialViewState={{ center: DEFAULT_CENTER, zoom: 12 }} />
      )}

      <NativeUserLocation mode={navigating ? 'course' : 'heading'} />

      {routes.length > 0 && (
        <GeoJSONSource
          id="routes"
          data={routeData}
          hitbox={{ top: 12, bottom: 12, left: 12, right: 12 }}
          onPress={(e) => {
            const id = e.nativeEvent.features?.[0]?.properties?.id;
            if (id) onSelectRoute?.(String(id));
          }}
        >
          <Layer
            id="route-casing"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': ['case', ['get', 'selected'], c.routeCasing, c.routeAlt],
              'line-width': ['case', ['get', 'selected'], 11, 8],
            }}
          />
          <Layer
            id="route-line"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': ['case', ['get', 'selected'], c.routeMain, scheme === 'dark' ? '#3A4652' : '#C9D3DD'],
              'line-width': ['case', ['get', 'selected'], 7, 5],
            }}
          />
        </GeoJSONSource>
      )}

      {incidents.map((inc) => {
        const type = typeOf(inc.type);
        return (
          <Marker key={inc.id} id={inc.id} lngLat={[inc.lng, inc.lat]} anchor="bottom" onPress={() => onIncidentPress(inc)}>
            <View style={[s.pin, { backgroundColor: type.color }]}>
              <Text style={s.pinIcon}>{type.icon}</Text>
            </View>
          </Marker>
        );
      })}

      {destination && (
        <Marker id="destination" lngLat={[destination.lng, destination.lat]} anchor="bottom">
          <Text style={{ fontSize: 40 }}>📍</Text>
        </Marker>
      )}
    </Map>
  );
});

const s = StyleSheet.create({
  pin: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  pinIcon: { fontSize: 18 },
});
