import { Link } from "react-router-dom";

const tools = [
  ["ダイレクトメッセージ", "/messages", "NIP-17/44で暗号化したDMを送受信します。"],
  ["長文記事", "/articles", "NIP-23の長文記事を公開・閲覧します。"],
  ["リスト", "/lists", "NIP-51の公開人物リストを管理します。"],
] as const;

export function ToolsPage() {
  return (
    <>
      <header className="border-b border-solid-gray-300 px-4 py-5 sm:px-6">
        <h1 className="text-2xl font-bold">その他の機能</h1>
      </header>
      <ul>
        {tools.map(([label, to, description]) => (
          <li key={to}>
            <Link
              className="block border-b border-solid-gray-300 px-4 py-5 hover:bg-solid-gray-50 focus-visible:outline focus-visible:outline-4 focus-visible:outline-black sm:px-6"
              to={to}
            >
              <span className="font-bold text-key-1000 underline">{label}</span>
              <span className="mt-1 block text-sm text-solid-gray-600">{description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
