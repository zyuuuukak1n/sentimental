// frontend/app/page.tsx
"use client";

import { useEffect, useState, useRef } from 'react';
import dynamic from 'next/dynamic';

const EmojiPicker = dynamic(
    () => import('emoji-picker-react'),
    { ssr: false }
);

// アニメーションさせる絵文字のデータを管理するための型定義（TypeScriptの機能）
type FloatingEmoji = {
    id: number;     // 画面から消すための個別認識ID
    emoji: string;  // 表示する絵文字
    left: number;   // 画面の横幅のどこから出現するか（%）
};

const generateSafeUUID = () => {
    // crypto.randomUUID が使える環境ならそのまま使う
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // 使えない環境なら、自力で文字列を生成する
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

export default function Home() {
    const [messages, setMessages] = useState<string[]>([]);
    const ws = useRef<WebSocket | null>(null);

    // ---------------------------------------------------------
    // ▼ 追加：画面に浮かぶ絵文字の配列（React State）
    // ---------------------------------------------------------
    const [floatingEmojis, setFloatingEmojis] = useState<FloatingEmoji[]>([]);

    const [totalCounts, setTotalCounts] = useState<Record<string, number>>({"😡": 0, "😭": 0, "🥺": 0});

    const [showPicker, setShowPicker] = useState<boolean>(false);

    useEffect(() => {
        let storedId = localStorage.getItem("sentimental_user_id");

        if (!storedId) {
            storedId = generateSafeUUID();
            localStorage.setItem("sentimental_user_id", storedId);
        }

        const wsUrl = process.env.NEXT_PUBLIC_WS_URL
            ? `${process.env.NEXT_PUBLIC_WS_URL}/ws/reactions/${storedId}`
            : `ws://${window.location.hostname}:8000/ws/reactions/${storedId}`;
            
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

            // サーバーから total_counts が送られてきたら、Stateを更新して画面に反映させる
            if (data.total_counts) {
                setTotalCounts(data.total_counts);
            }
            
            // サーバーから「絵文字」が送られてきた場合、アニメーションを発生させる
            if (data.received_emoji && data.status === "broadcast") {
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
        <main className="min-h-[100dvh] relative flex flex-col items-center justify-start md:justify-center font-sans p-4 py-12 overflow-x-hidden overflow-y-auto">
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
                <div className="w-full flex justify-end mb-4 px-2">
                    <button 
                        onClick={async () => {
                            const apiUrl = process.env.NEXT_PUBLIC_API_URL
                                ? `${process.env.NEXT_PUBLIC_API_URL}`
                                : `http://${window.location.hostname}:8000`;

                            const res = await fetch(`${apiUrl}/auth/google/login`);

                            // res.ok は、ステータスコードが 200〜299（成功）の時だけ true になります
                                if (!res.ok) {
                                    const errorData = await res.json();
                                    // ブラウザのアラートでユーザー（または開発者）にエラー原因を通知します
                                    alert(`サーバーエラーが発生しました:\n${errorData.detail}`);
                                    return; // ここで処理を中断し、undefinedへの遷移を防ぎます
                                }

                            const data = await res.json();
                            // Googleのログイン画面へ移動
                            window.location.href = data.url;
                        }}
                        className="px-4 py-2 bg-white/80 backdrop-blur-sm border border-gray-200 text-gray-600 font-bold rounded-xl text-xs md:text-sm shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all flex items-center gap-2"
                    >
                        {/* GoogleのGマークアイコン（SVG） */}
                        <svg className="w-4 h-4" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                        Sign in with Google
                    </button>
                </div>
                
                <h1 className="text-xl md:text-2xl font-bold mb-8 md:mb-12 text-gray-600 tracking-wider">
                    SENTIMENTAL
                </h1>
                
                {/* ▼ 修正：絵文字ボタンエリア（折り返し対応とサイズ調整）
                  * flex-wrap: 画面に収まらない場合は自動で改行させる
                  * gap-4 md:gap-8: スマホでは隙間を狭く、PC(md以上)では広く
                  */}
                <div className="flex flex-wrap justify-center gap-4 md:gap-8 w-full px-2">
                    {/* 😡 ボタンのブロック */}
                    <div className="flex flex-col items-center gap-2">
                        <button onClick={() => sendEmoji("😡")} className="text-5xl md:text-6xl p-5 md:p-8 bg-white rounded-2xl md:rounded-3xl shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 ease-out">
                            😡
                        </button>
                        {/* ▼ 追加：カンマ区切りで累計数を表示 */}
                        <span className="text-sm font-bold text-gray-500 tracking-wider">
                            {totalCounts["😡"]?.toLocaleString() || 0}
                        </span>
                    </div>

                    {/* 😭 ボタンのブロック */}
                    <div className="flex flex-col items-center gap-2">
                        <button onClick={() => sendEmoji("😭")} className="text-5xl md:text-6xl p-5 md:p-8 bg-white rounded-2xl md:rounded-3xl shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 ease-out">
                            😭
                        </button>
                        <span className="text-sm font-bold text-gray-500 tracking-wider">
                            {totalCounts["😭"]?.toLocaleString() || 0}
                        </span>
                    </div>

                    {/* 🥺 ボタンのブロック */}
                    <div className="flex flex-col items-center gap-2">
                        <button onClick={() => sendEmoji("🥺")} className="text-5xl md:text-6xl p-5 md:p-8 bg-white rounded-2xl md:rounded-3xl shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 ease-out">
                            🥺
                        </button>
                        <span className="text-sm font-bold text-gray-500 tracking-wider">
                            {totalCounts["🥺"]?.toLocaleString() || 0}
                        </span>
                    </div>
                </div>

                {/* 自由な絵文字の入力エリア */}
                <div className="mt-8 flex flex-col items-center w-full">
                    
                    {/* ========================================= */}
                    {/* 【非表示】入力欄 */}
                    {/* <p className="text-xs text-gray-400 mb-2 font-bold tracking-widest">
                        OR TYPE ANY EMOJI
                    </p>
                    <input
                        type="text"
                        placeholder="✨ ここに入力..."
                        className="p-4 rounded-2xl border-2 border-gray-100 text-3xl text-center bg-white/50 focus:bg-white focus:outline-none focus:border-blue-200 focus:ring-4 focus:ring-blue-50 transition-all duration-300 w-64 shadow-sm"
                        // onChange は「入力欄の中身が変わった瞬間」に発動する
                        // 絵文字が1つ入力されたら即座に sendEmoji でサーバーに送信し、
                        // e.target.value = '' で入力欄を瞬時にリセットする。
                        onChange={(e) => {
                            const val = e.target.value;
                            if (val) {
                                sendEmoji(val);
                                e.target.value = '';
                            }
                        }}
                    />  */}
                    {/* ========================================= */}

                    {/* 絵文字ピッカーボタンと本体の描画 */}
                    <button
                        onClick={() => setShowPicker(!showPicker)}
                        className="mt-4 px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold rounded-xl text-sm shadow-sm transition-all duration-300 flex items-center gap-2 z-20"
                    >
                        {showPicker ? "❌ ピッカーを閉じる" : "😀 ピッカーから選ぶ"}
                    </button>

                    {/* 【学習コメント：条件付きレンダリング】
                      * showPicker が true の時だけ、&& よりも右側のHTMLコードが画面に実体化します。
                      */}
                    {showPicker && (
                        <div className="mt-4 z-50 shadow-xl rounded-2xl overflow-hidden">
                            <EmojiPicker 
                                // ピッカー内の絵文字がクリックされたら発動するイベント
                                onEmojiClick={(emojiObject) => {
                                    // emojiObject.emoji の中に「🍣」や「🎉」といった実際の文字データが入っています
                                    sendEmoji(emojiObject.emoji); 
                                    // 送信したら、画面をスッキリさせるためにピッカーを自動で閉じます（親切設計）
                                    // setShowPicker(false);         
                                }}
                                // アプリの柔らかい雰囲気に合わせるためのビジュアル調整
                                previewConfig={{ showPreview: false }} // 下部の余計なプレビュー欄を消してコンパクトにする
                                width="320px"
                                height="350px"
                            />
                        </div>
                    )}

                </div>

                {/* ========================================= */}
                {/* 【非表示】ログエリア */}
                {/* <div className="mt-12 md:mt-16 p-5 md:p-6 bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-gray-100 w-full max-w-md h-48 md:h-64 overflow-y-auto">
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
                </div>  */}
                {/* ========================================= */}

            </div>
        </main>
    );
}