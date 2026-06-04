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

    // ハンバーガーメニューの開閉状態
    const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);

    // モーダルの開閉状態、現在のモード、入力フォームの値を管理
    const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
    const [isLoginMode, setIsLoginMode] = useState<boolean>(true);
    const [authEmail, setAuthEmail] = useState<string>("");
    const [authPassword, setAuthPassword] = useState<string>("");
    const [authName, setAuthName] = useState<string>("");

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

            {/* ハンバーガーメニュー */}
            <div className="absolute top-4 right-4 z-50">
                <button
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    className="p-3 bg-white/80 backdrop-blur-sm border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-all text-gray-600"
                >
                    {isMenuOpen ? (
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    ) : (
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                    )}
                </button>

                {isMenuOpen && (
                    <div className="absolute right-0 mt-2 w-64 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-gray-100 p-3 flex flex-col gap-2">
                        <p className="text-xs font-bold text-gray-400 mb-1 px-2 tracking-wider">LOGIN / SIGNUP</p>
                        
                        {/* 既存のGoogleボタンをここに移動・デザイン調整 */}
                        <button 
                            onClick={async () => {
                                const apiUrl = process.env.NEXT_PUBLIC_API_URL 
                                    ? `${process.env.NEXT_PUBLIC_API_URL}` 
                                    : `http://${window.location.hostname}:8000`;
                                try {
                                    const res = await fetch(`${apiUrl}/auth/google/login`);
                                    if (!res.ok) {
                                        const errorData = await res.json();
                                        alert(`サーバーエラーが発生しました:\n${errorData.detail}`);
                                        return;
                                    }
                                    const data = await res.json();
                                    window.location.href = data.url;
                                } catch (error) {
                                    alert("バックエンドサーバーに接続できませんでした。");
                                }
                            }}
                            className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 text-gray-700 font-semibold rounded-xl text-sm transition-all flex items-center gap-3"
                        >
                            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                            </svg>
                            Continue with Google
                        </button>

                        {/* 今後の実装予定のボタン（現時点では押せないモックUI） */}
                        <button className="w-full px-4 py-3 bg-gray-900 hover:bg-gray-800 text-white font-semibold rounded-xl text-sm transition-all flex items-center gap-3 opacity-50 cursor-not-allowed" title="準備中">
                            <svg className="w-5 h-5 fill-current shrink-0" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                            Continue with GitHub
                        </button>
                        <button className="w-full px-4 py-3 bg-black hover:bg-gray-800 text-white font-semibold rounded-xl text-sm transition-all flex items-center gap-3 opacity-50 cursor-not-allowed" title="準備中">
                            <svg className="w-5 h-5 fill-current shrink-0" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                            Continue with X
                        </button>
                        <div className="w-full h-px bg-gray-100 my-1"></div>
                        <button 
                            onClick={() => {
                                setIsMenuOpen(false);
                                setIsAuthModalOpen(true);
                            }}
                            className="w-full px-4 py-3 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold rounded-xl text-sm transition-all flex items-center gap-3"
                        >
                            <span className="w-5 h-5 flex items-center justify-center shrink-0">✉️</span>
                            Email / Password
                        </button>
                    </div>
                )}
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

            {/* 認証モーダルUIと通信ロジック */}
            {isAuthModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 relative overflow-hidden">

                        {/* 閉じるボタン */}
                        <button
                            onClick={() => setIsAuthModalOpen(false)}
                            className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>

                        <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">
                            {isLoginMode ? "おかえりなさい" : "アカウント作成"}
                        </h2>

                        <form 
                            onSubmit={async (e) => {
                                e.preventDefault();
                                const apiUrl = process.env.NEXT_PUBLIC_API_URL ? `${process.env.NEXT_PUBLIC_API_URL}` : `http://${window.location.hostname}:8000`;
                                const endpoint = isLoginMode ? "/auth/login" : "/auth/register";
                                
                                // 送信するデータをモードに応じて切り替え
                                const payload = isLoginMode
                                    ? { email: authEmail, password: authPassword }
                                    : { email: authEmail, password: authPassword, name: authName };

                                try {
                                    // 【学習コメント】
                                    // fetch() でPOST通信を行います。headersで「JSON形式で送るよ」と宣言し、
                                    // bodyでJavaScriptのオブジェクトを文字列（JSON）に変換して送信します。
                                    const res = await fetch(`${apiUrl}${endpoint}`, {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify(payload),
                                    });

                                    if (!res.ok) {
                                        const errorData = await res.json();
                                        alert(`エラー: ${errorData.detail}`);
                                        return;
                                    }

                                    const data = await res.json();
                                    
                                    // 【最重要：ゲストIDの上書き】
                                    // ログイン成功時にバックエンドから発行された正規のユーザーIDをローカルストレージに保存し、
                                    // ゲストIDから「本会員ID」へと昇格させます。
                                    localStorage.setItem("sentimental_user_id", data.user_id);
                                    
                                    alert(`${data.message}\nようこそ！`);
                                    setIsAuthModalOpen(false);
                                    
                                    // IDが切り替わったため、WebSocketを繋ぎ直すために画面をリロード
                                    window.location.reload();

                                } catch (error) {
                                    alert("サーバーとの通信に失敗しました。ネットワークを確認してください。");
                                }
                            }}
                            className="flex flex-col gap-4"
                        >
                            {!isLoginMode && (
                                <div>
                                    <label className="block text-sm font-semibold text-gray-600 mb-1">表示名</label>
                                    <input 
                                        type="text" required
                                        value={authName} onChange={(e) => setAuthName(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white transition-all text-gray-700"
                                        placeholder="Sentimental 太郎"
                                    />
                                </div>
                            )}
                            <div>
                                <label className="block text-sm font-semibold text-gray-600 mb-1">メールアドレス</label>
                                <input 
                                    type="email" required
                                    value={authEmail} onChange={(e) => setAuthEmail(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white transition-all text-gray-700"
                                    placeholder="your@email.com"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-600 mb-1">パスワード</label>
                                <input 
                                    type="password" required minLength={6}
                                    value={authPassword} onChange={(e) => setAuthPassword(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white transition-all text-gray-700"
                                    placeholder="6文字以上"
                                />
                            </div>

                            <button 
                                type="submit"
                                className="w-full py-3.5 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-xl shadow-md hover:shadow-lg transition-all mt-4"
                            >
                                {isLoginMode ? "ログイン" : "登録してはじめる"}
                            </button>
                        </form>

                        <div className="mt-6 text-center text-sm text-gray-500">
                            {isLoginMode ? "アカウントをお持ちでないですか？" : "すでにアカウントをお持ちですか？"}
                            <button 
                                onClick={() => setIsLoginMode(!isLoginMode)}
                                className="ml-2 font-bold text-blue-500 hover:text-blue-600 transition-colors"
                            >
                                {isLoginMode ? "新規登録" : "ログイン"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </main>
    );
}