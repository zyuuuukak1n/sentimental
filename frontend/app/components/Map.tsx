"use client";

import maplibregl from 'maplibre-gl';
import Map, { Marker } from 'react-map-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

type FloatingEmoji = {
    id: number;
    emoji: string;
    left?: number;
    latitude?: number;
    longitude?: number;
};

export default function EmotionMap({ floatingEmojis }: { floatingEmojis: FloatingEmoji[] }) {
    // 【防御的設計】APIキーは環境変数から読み込む
    const mapTilerKey = process.env.NEXT_PUBLIC_MAPTILER_API_KEY;

    if (!mapTilerKey) {
        return (
            <div className="absolute inset-0 bg-gray-50 flex items-center justify-center z-0 pointer-events-none">
                <p className="text-gray-400 font-bold tracking-widest text-sm">
                    MAPTILER API KEY IS MISSING
                </p>
            </div>
        );
    }

    return (
        <div className="absolute inset-0 z-0 pointer-events-none">
            <Map
                mapLib={maplibregl}
                initialViewState={{
                    longitude: 139.767, // 東京をデフォルトの初期位置とする
                    latitude: 35.681,
                    zoom: 2
                }}
                style={{ width: '100%', height: '100%' }}
                mapStyle={`https://api.maptiler.com/maps/streets-v2/style.json?key=${mapTilerKey}`}
                interactive={false} // 背景としての演出なのでインタラクションはオフにする
            >
                {floatingEmojis.map((e) => (
                    e.latitude && e.longitude ? (
                        <Marker key={e.id} longitude={e.longitude} latitude={e.latitude} anchor="bottom">
                            <div className="animate-float text-4xl md:text-5xl drop-shadow-lg">
                                {e.emoji}
                            </div>
                        </Marker>
                    ) : null
                ))}
            </Map>
        </div>
    );
}
