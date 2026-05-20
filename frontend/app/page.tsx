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
        <main style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#1a1a1a', color: 'white'}}>
            <h1>リアルタイム通信テスト</h1>

            {/* 絵文字ボタンエリア */}
            <div style={{ marginTop: '20px' }}>
                <button
                    onClick={() => sendEmoji("😡")} // ボタンを押すと "😡" を引数にして sendEmoji 関数が走る
                    style={{ fontSize: '3rem', padding: '10px 20px', cursor: 'pointer', borderRadius: '10px', backgroundColor: '#333', border: 'none' }}
                >
                    😡
                </button>
                <button
                    onClick={() => sendEmoji("😭")}
                    style={{ fontSize: '3rem', padding: '10px 20px', cursor: 'pointer', borderRadius: '10px', backgroundColor: '#333', border: 'none', marinLeft: '10px' }}
                >
                    😭
                </button>
            </div>

            {/* やまびこ（受信データ）を表示するエリア */}
            <div style={{ marginTop: '40px', padding: '20px', backgroundColor: '#222', borderRadius: '10px', width: '80%', maxWidth: '500px', height: '200px', overflowY: 'auto' }}>
                <h3 style={{ margin: '0 0 10px 0' }}>サーバーからの応答:</h3>

                {/* message配列の中身を map 関数で一つずつ取り出して、divタグとして描画する */}
                {messages.map((msg, index) => (
                    // key={index} は、Reactが「どの行が変わったか」を識別するための目印として必須
                    <div key={index} style={{ fontFamily: 'monospace', marginBottom: '5px', color: '#00ff00' }}>
                        {msg}
                    </div>
                ))}
            </div>
        </main>
    );
}