// frontend/app/page.tsx
"use client";

import { useEffect, useState, useRef } from 'react';

// アニメーションさせる絵文字のデータを管理するための型定義（TypeScriptの機能）
type FloatingEmoji = {
    id: number;     // 画面から消すための個別認識ID
    emoji: string;  // 表示する絵文字
    left: number;   // 画面の横幅のどこから出現するか（%）
};

export default function Home() {
    const [messages, setMessages] = useState<string[]>([]);
    const ws = useRef<WebSocket | null>(null);

    // ---------------------------------------------------------
    // ▼ 追加：画面に浮かぶ絵文字の配列（React State）
    // ---------------------------------------------------------
    const [floatingEmojis, setFloatingEmojis] = useState<FloatingEmoji[]>([]);

    useEffect(() => {
        // →変更: URLを動的（ダイナミック）にする
        // window.location.hostname には、現在ブラウザが表示しているURLの「ドメイン部分」が自動で入る
        const wsUrl = process.env.NEXT_PUBLIC_WS_URL 
            ? `${process.env.NEXT_PUBLIC_WS_URL}/ws/reactions` 
            : 'ws://${window.location.hostname}:8000/ws/reactions';
            
        ws.current = new WebSocket(wsUrl);

        ws.current.onopen = () => {
            console.log("WebSocket接続成功！");
        };

        // ▼ 変更：サーバーからメッセージを受信したときの処理
        ws.current.onmessage = (event) => {
            // テキストログを追加
            setMessages(prev => [...prev, event.data]);

            // JSON文字列をJavaScriptのオブジェクトに変換
            const data = JSON.parse(event.data);
            
            // サーバーから「絵文字」が送られてきた場合、アニメーションを発生させる
            if (data.received_emoji) {
                // 1. 新しい絵文字オブジェクトを作成
                const newEmoji: FloatingEmoji = {
                    id: Date.now() + Math.random(), // 時間＋乱数で絶対に被らないIDを作る
                    emoji: data.received_emoji,
                    left: Math.random() * 80 + 10,  // 画面横幅の10%〜90%のランダムな位置
                };

                // 2. 画面に絵文字を追加して描画させる
                setFloatingEmojis(prev => [...prev, newEmoji]);

                // 3. 【防御的設計】3秒後にこの絵文字を配列から削除する（メモリリーク・DOM肥大化防止）
                // アニメーションが終わって見えなくなった要素を放置するとブラウザがクラッシュするため必須の処理です。
                setTimeout(() => {
                    setFloatingEmojis(prev => prev.filter(e => e.id !== newEmoji.id));
                }, 3000);
            }
        };

        return () => {
            if (ws.current) {
                ws.current.close();
            }
        };
    }, []);

    const sendEmoji = (emoji: string) => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            const payload = JSON.stringify({ emoji: emoji, count: 1 });
            ws.current.send(payload);
        }
    };

    // ---------------------------------------------------------
    // ▼ UI描画部分（レスポンシブ対応版）
    // ---------------------------------------------------------
    return (
        <main className="min-h-screen relative flex flex-col items-center justify-center font-sans p-4 overflow-hidden">
            
            {/* フワフワ浮かぶ絵文字の描画エリア */}
            <div className="absolute inset-0 pointer-events-none z-0">
                {floatingEmojis.map((obj) => (
                    <div 
                        key={obj.id} 
                        className="animate-float text-5xl md:text-6xl bottom-10" // スマホでは少し小さめ(5xl)、PCでは大きく(6xl)
                        style={{ left: `${obj.left}%` }}
                    >
                        {obj.emoji}
                    </div>
                ))}
            </div>

            {/* 前面コンテンツ */}
            <div className="z-10 flex flex-col items-center w-full max-w-2xl mx-auto">
                <h1 className="text-xl md:text-2xl font-bold mb-8 md:mb-12 text-gray-600 tracking-wider">
                    SENTIMENTAL
                </h1>
                
                {/* ▼ 修正：絵文字ボタンエリア（折り返し対応とサイズ調整）
                  * flex-wrap: 画面に収まらない場合は自動で改行させる
                  * gap-4 md:gap-8: スマホでは隙間を狭く、PC(md以上)では広く
                  */}
                <div className="flex flex-wrap justify-center gap-4 md:gap-8 w-full px-2">
                    <button 
                        onClick={() => sendEmoji("😡")} 
                        // ▼ 修正：スマホでは余白と文字サイズを少し小さくする
                        className="text-5xl md:text-6xl p-5 md:p-8 bg-white rounded-2xl md:rounded-3xl shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 ease-out"
                    >
                        😡
                    </button>
                    <button 
                        onClick={() => sendEmoji("😭")} 
                        className="text-5xl md:text-6xl p-5 md:p-8 bg-white rounded-2xl md:rounded-3xl shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 ease-out"
                    >
                        😭
                    </button>
                    <button 
                        onClick={() => sendEmoji("🥺")} 
                        className="text-5xl md:text-6xl p-5 md:p-8 bg-white rounded-2xl md:rounded-3xl shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 ease-out"
                    >
                        🥺
                    </button>
                </div>

                {/* ログエリア */}
                <div className="mt-12 md:mt-16 p-5 md:p-6 bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-gray-100 w-full max-w-md h-48 md:h-64 overflow-y-auto">
                    <h3 className="text-xs md:text-sm font-semibold text-gray-400 mb-4 uppercase tracking-wider">
                        Server Response Log
                    </h3>
                    <div className="flex flex-col gap-2">
                        {messages.map((msg, index) => (
                            <div key={index} className="font-mono text-[10px] md:text-xs text-gray-500 bg-gray-50/80 p-2 md:p-3 rounded-xl break-words">
                                {msg}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </main>
    );
}