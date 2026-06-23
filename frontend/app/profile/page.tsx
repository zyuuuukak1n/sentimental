"use client";

import { useEffect, useState } from 'react';

// プロフィール情報の型定義
type UserProfile = {
    id: string;
    name: string;
    email: string;
    avatar_url: string | null;
    is_guest: boolean;
    created_at: string;
};

type ReactionSummary = {
    emoji_code: string;
    total: number;
};

export default function ProfilePage() {
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [reactions, setReactions] = useState<ReactionSummary[]>([]);
    const [loading, setLoading] = useState<boolean>(true);

    useEffect(() => {
        const fetchProfile = async () => {
            const token = localStorage.getItem("sentimental_access_token");
            const userId = localStorage.getItem("sentimental_user_id");

            if (!token || !userId) {
                alert("ログインが必要です。");
                window.location.href = '/';
                return;
            }

            const apiUrl = process.env.NEXT_PUBLIC_API_URL || `http://${window.location.hostname}:8000`;

            try {
                const res = await fetch(`${apiUrl}/users/${userId}/profile`, {
                    method: "GET",
                    headers: {
                        "Authorization": `Bearer ${token}`
                    }
                });

                if (!res.ok) {
                    if (res.status === 401 || res.status === 403) {
                        alert("セッションの有効期限が切れたか、権限がありません。再度ログインしてください。");
                        localStorage.removeItem("sentimental_access_token");
                        window.location.href = '/';
                        return;
                    }
                    throw new Error("プロフィールの取得に失敗しました。");
                }

                const data = await res.json();
                setProfile(data.user);
                setReactions(data.reactions_summary);
            } catch (error) {
                console.error(error);
                alert("通信エラーが発生しました。");
            } finally {
                setLoading(false);
            }
        };

        fetchProfile();
    }, []);

    if (loading) {
        return (
            <div className="min-h-[100dvh] flex items-center justify-center bg-gray-50">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
            </div>
        );
    }

    if (!profile) return null;

    // トータルクリック数を計算して最大値を求める（バーの横幅計算用）
    const maxClicks = Math.max(...reactions.map(r => r.total), 1);
    const totalClicks = reactions.reduce((sum, r) => sum + r.total, 0);

    return (
        <main className="min-h-[100dvh] relative flex flex-col items-center py-12 px-4 bg-gray-50">
            {/* バックボタン */}
            <button 
                onClick={() => window.location.href = '/'}
                className="absolute top-6 left-6 p-3 bg-white border border-gray-200 rounded-full shadow-sm hover:shadow-md hover:-translate-x-1 transition-all text-gray-600"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            </button>

            <div className="w-full max-w-2xl bg-white rounded-3xl shadow-xl overflow-hidden mt-8 border border-gray-100">
                
                {/* ヘッダー背景（グラデーション） */}
                <div className="h-32 bg-gradient-to-r from-blue-400 to-indigo-500 relative">
                    {/* アバター画像がここに乗る */}
                    <div className="absolute -bottom-12 left-8 w-24 h-24 bg-white rounded-full p-1 shadow-lg">
                        <div className="w-full h-full bg-gray-100 rounded-full flex items-center justify-center text-4xl">
                            {profile.avatar_url ? (
                                <img src={profile.avatar_url} alt="avatar" className="w-full h-full rounded-full object-cover" />
                            ) : (
                                "👤"
                            )}
                        </div>
                    </div>
                </div>

                {/* プロフィール情報 */}
                <div className="pt-16 pb-8 px-8">
                    <h1 className="text-2xl font-bold text-gray-900">{profile.name || "名称未設定"}</h1>
                    <p className="text-sm text-gray-500 mt-1">{profile.email || "メールアドレスなし"}</p>
                    <div className="mt-4 flex gap-4">
                        <div className="bg-gray-50 px-4 py-2 rounded-xl border border-gray-100">
                            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Total Reacts</p>
                            <p className="text-lg font-bold text-gray-700">{totalClicks.toLocaleString()}</p>
                        </div>
                        <div className="bg-gray-50 px-4 py-2 rounded-xl border border-gray-100">
                            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Member Since</p>
                            <p className="text-sm font-semibold text-gray-700 mt-1">
                                {new Date(profile.created_at).toLocaleDateString()}
                            </p>
                        </div>
                    </div>
                </div>

                <hr className="border-gray-100" />

                {/* リアクション履歴の可視化 */}
                <div className="p-8 bg-gray-50/50">
                    <h2 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
                        <span>📊</span> Your Emotion History
                    </h2>

                    {reactions.length === 0 ? (
                        <div className="text-center py-8 text-gray-500 bg-white rounded-2xl border border-gray-100 border-dashed">
                            まだリアクション履歴がありません。<br/>トップページから絵文字を送信してみましょう！
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* クリック数が多い順にソートして表示 */}
                            {reactions.sort((a, b) => b.total - a.total).map((r) => (
                                <div key={r.emoji_code} className="flex items-center gap-4 bg-white p-3 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                                    <div className="text-3xl shrink-0 bg-gray-50 w-12 h-12 flex items-center justify-center rounded-xl">
                                        {r.emoji_code}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex justify-between mb-1">
                                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Clicks</span>
                                            <span className="text-sm font-bold text-gray-700">{r.total.toLocaleString()}</span>
                                        </div>
                                        {/* 横幅を%で計算してプログレスバーのように表示 */}
                                        <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                                            <div 
                                                className="bg-indigo-400 h-2.5 rounded-full transition-all duration-1000 ease-out"
                                                style={{ width: `${(r.total / maxClicks) * 100}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </main>
    );
}
