// frontend/app/page.tsx

// ▼ "use client" はNext.jsの特有の宣言
// 「このファイルはサーバー側ではなく、ユーザーのブラウザ側で動かす」という指示で
// useStateなどのReact Hooksを使うためにファイルの先頭に必ず書く必要がある
"use client";

import { useEffect, useState, useRef } from 'react';

export default function Home() {
    // ---------------------------------------------------------
    // ▼ 状態管理（React Hooks）の準備
    // ---------------------------------------------------------
    // useState: 画面の表示を切り替えるための「変数」と「それを書き換える関数」のセット
    // ここでは、サーバーから帰ってきたメッセージの履歴を配列（string[]）として保存する
    // setMessagesを実行すると、Reactが自動的に画面を最新状態に再描画してくれる
    const [messages, setMessages] = useState<string[]>([]);

    // useRef: 画面が再描画されても中身が消えない、裏側で保持しておきたい「箱」
    // Websocketの接続情報（パイプ）は、画面が更新されるたびにリセットされると困るので、useRefに入れる
    const ws = useRef<WebSocket | null>(null);

    // ---------------------------------------------------------
    // ▼ 画面が表示された瞬間に実行される処理
    // ---------------------------------------------------------
    // useEffect: コンポーネント（この画面）がマウント（表示）された時や、
    // 特定の値が変わった時に自動で動く処理を書く。
    // 第2引数が []（空の配列）の場合、「初回表示時の1回だけ」実行される。
    useEffect(() => {
        // 環境変数からWebSocketのURLを取得。設定が無ければ localhost を使用します
        const wsUrl = process.env.NEXT_PUBLIC_WS_URL
            ? `${process.env.NEXT_PUBLIC_WS_URL}/ws/reactions`
            : 'ws://localhost:8000/ws/reactions';
        
        // サーバーに対してWebSocket通信の接続を開始
        ws.current = new WebSocket(wsUrl);

        // 接続が成功した時に発火するイベント
        ws.current.onopen = () => {
            console.log("WebSocket接続成功！");
        };

        // サーバーからデータ（メッセージ）を受け取った時に発火するイベント
        ws.current.onmessage = (event) => {
            console.log("サーバーからのメッセージ:", event.data);

            // 古いメッセージの配列（prev）を展開し、末尾に新しいメッセージを追加して保存
            // これにより画面が再描画され、黒ボックスに文字が追加される
            setMessages(prev => [...prev, event.data]);
        };

        // cleanup関数（returnで返す関数）:
        // ユーザーが別のページに移動するなどして、この画面が消える瞬間に実行される
        // 通信の繋ぎっぱなし（メモリリーク）を防ぐための重要な防御的設計
        return () => {
            if (ws.current) {
                ws.current.close();
            }
        };
    }, []); // ← この空配列が「初回のみ実行」のサイン

    // ---------------------------------------------------------
    // ▼ ボタンを押した時の処理
    // ---------------------------------------------------------
    const sendEmoji = (emoji: string) => {
        // ws.current が存在し、かつ接続がOPEN（開いている）状態の時だけ送信
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            // オブジェクトをJSON文字列に変換
            const payload = JSON.stringify({ emoji: emoji, count: 1 });
            // サーバーへ送信
            ws.current.send(payload);
        }
    };

    // ---------------------------------------------------------
    // ▼ 画面の描画（HTML/CSS）
    // ---------------------------------------------------------
    return (
        /* * tailwindの解説
         * min-h-screen: 画面の高さを最低でも100%確保
         * flex flex-col items-center justify-center: 盾並びでど真ん中に配置
         * font-sans: モダンなゴシック体を使用
         */
        <main className="min-h-screen flex flex-col items-center justify-center font-sans p-4">
            
            <h1 className="text-2xl font-bold mb-12 text-gray-600 tracking-winder">
                SENTIMENTAL
            </h1>

            {/* 絵文字ボタンエリア */}
            <div className="flex gap-8">
                {/* * ボタンのデザイン解説:
                 * bg-white: ボタンの背景を白に
                 * rounded-3xl: 角を大きく丸めてソフトな印象に
                 * shadow-sm: デフォルトではごく薄い影
                 * hover:shadow-lg hover:-translate-y-1: マウスを乗せると影が濃くなり、少し上にフワッと浮く
                 * transition-all duration-300 ease-out: 上記の変化を300ミリ秒かけて滑らかに行う
                 */}
                 <button
                     onClick={() => sendEmoji("😡")}
                     className="text-6xl p-8 bg-white rounded-3xl shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 ease-out"
                >
                    😡
                </button>
                <button
                    onClick={() => sendEmoji("😭")}
                    className="text-6xl p-8 bg-white rounded-3xl shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 ease-out"
                >
                    😭
                </button>
                <button
                    onClick={() => sendEmoji("🥺")}
                    className="text-6xl p-8 bg-white rounded-3xl shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 ease-out"
                >
                    🥺
                </button>
            </div>

            {/* やまびこ（受信データ）を表示するログエリア */}
            <div className="mt-16 p-6 bg-white rounded-2xl shadow-sm border border-gray-100 w-full max-w-md h-64 overflow-y-auto">
                <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase tracking-wider">
                    Server Response Log
                </h3>

                <div className="flex flex-col gap-2">
                    {messages.map((msg, index) => (
                        <div
                            key={index}
                            // ログの1行1行も、角丸の薄いグレー背景にして柔らかく見せる
                            className="font-mono text-xs text-gray-500 bg-gray-50 p-3 rounded-xl break-words"
                        >
                            {msg}
                        </div>    
                    ))}
                    {/* メッセージが無い時のプレースホルダー */}
                    {messages.length === 0 && (
                        <div className="text-gray-300 text-sm text-center mt-8">
                            絵文字を押すとここに通信結果が表示されます
                        </div>
                    )}
                </div>
            </div>
        </main>
    );
}