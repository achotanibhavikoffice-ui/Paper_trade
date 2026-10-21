import React, { useEffect, useState } from "react";
import {
  Landmark,
  ShieldCheck,
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  Info,
  HelpCircle,
} from "lucide-react";
import { PageHeader } from "../components/common/PageHeader";
import { StatCard } from "../components/common/StatCard";
import { LoadingSkeleton } from "../components/common/LoadingSkeleton";
import { EmptyState } from "../components/common/EmptyState";
import { accountApi } from "../api";
import { AccountInfo, LedgerEntry } from "../types";
export const AccountPage: React.FC = () => {
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    async function loadAccountData() {
      try {
        setLoading(true);
        const [accData, ledgerData] = await Promise.all([
          accountApi.getAccount(),
          accountApi.getLedger(),
        ]);
        setAccount(accData);
        setLedger(ledgerData.items);
      } catch (err) {
        setLoadError(
          err instanceof Error
            ? err.message
            : "Could not load account details.",
        );
        console.error("Failed to load account details:", err);
      } finally {
        setLoading(false);
      }
    }
    loadAccountData();
  }, []);
  const formatINR = (val: number | string) => {
    const num = typeof val === "string" ? parseFloat(val) : val;
    if (isNaN(num)) return "₹0.00";
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(num);
  };
  return (
    <div className="space-y-6">
      {" "}
      <PageHeader
        title="Practice Account & Virtual Capital"
        description="Manage your paper trading virtual balance, account specifications, and cash audit ledger."
        eyebrow="Account & Capital"
      />{" "}
      {/* Info Warning Banner */}{" "}
      <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 flex items-start gap-3">
        {" "}
        <Info className="w-5 h-5 text-sky-600 mt-0.5 shrink-0" />{" "}
        <div className="text-sm text-sky-800 ">
          {" "}
          <span className="font-semibold">Paper Trading Environment:</span> Your
          account uses virtual capital only. Every order and fill is simulated;
          no real money or stock exchange delivery is involved.{" "}
        </div>{" "}
      </div>{" "}
      {loadError && (
        <div className="trade-notice error" role="alert">
          {loadError}
        </div>
      )}{" "}
      {/* Summary Cards */}{" "}
      {loading ? (
        <LoadingSkeleton type="cards" count={4} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {" "}
          <StatCard
            label="Available Cash"
            value={account ? formatINR(account.cash_balance) : "—"}
            icon={<Wallet className="w-5 h-5" />}
            subtext="Virtual funds ready for deployment"
          />{" "}
          <StatCard
            label="Initial Capital"
            value={account ? formatINR(account.initial_capital) : "—"}
            icon={<Landmark className="w-5 h-5" />}
            subtext="Allocated on account creation"
          />{" "}
          <StatCard
            label="Account Status"
            value={account?.status ? account.status.toUpperCase() : "—"}
            icon={<ShieldCheck className="w-5 h-5 text-emerald-500" />}
            subtext="NSE Virtual Trading Status"
          />{" "}
          <StatCard
            label="Account Currency"
            value={account?.currency || "INR"}
            subtext="Indian Rupee (₹)"
          />{" "}
        </div>
      )}{" "}
      {/* Detailed Specifications */}{" "}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        {" "}
        <h2 className="text-lg font-bold text-slate-900 mb-4">
          Account Specifications
        </h2>{" "}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {" "}
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-100 ">
            {" "}
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Account Number
            </span>{" "}
            <p className="text-base font-mono font-bold text-slate-800 mt-1">
              {" "}
              {account?.account_number || "—"}{" "}
            </p>{" "}
          </div>{" "}
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-100 ">
            {" "}
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Account Type
            </span>{" "}
            <p className="text-base font-medium text-slate-800 mt-1">
              {" "}
              {account?.account_type || "—"}{" "}
            </p>{" "}
          </div>{" "}
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-100 ">
            {" "}
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Creation Date
            </span>{" "}
            <p className="text-base font-medium text-slate-800 mt-1">
              {" "}
              {account?.created_at
                ? new Date(account.created_at).toLocaleDateString()
                : "—"}{" "}
            </p>{" "}
          </div>{" "}
        </div>{" "}
      </div>{" "}
      {/* Cash Ledger Section */}{" "}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        {" "}
        <div className="flex items-center justify-between mb-4">
          {" "}
          <div>
            {" "}
            <h2 className="text-lg font-bold text-slate-900 ">
              Cash Audit Ledger
            </h2>{" "}
            <p className="text-xs text-slate-500 ">
              Complete immutable record of all virtual capital adjustments and
              allocations.
            </p>{" "}
          </div>{" "}
        </div>{" "}
        {loading ? (
          <LoadingSkeleton type="table" rows={4} />
        ) : ledger.length === 0 ? (
          <EmptyState
            title="No ledger history found"
            description="Virtual capital audit logs will record initial funding, trade debits, credits, and reset events here."
            icon={Landmark}
          />
        ) : (
          <div className="overflow-x-auto">
            {" "}
            <table className="w-full text-left text-sm">
              {" "}
              <thead className="text-xs uppercase bg-slate-50 text-slate-500 border-b border-slate-200 ">
                {" "}
                <tr>
                  {" "}
                  <th className="px-4 py-3">Timestamp</th>{" "}
                  <th className="px-4 py-3">Entry Type</th>{" "}
                  <th className="px-4 py-3">Description</th>{" "}
                  <th className="px-4 py-3 text-right">Amount</th>{" "}
                  <th className="px-4 py-3 text-right">Balance After</th>{" "}
                </tr>{" "}
              </thead>{" "}
              <tbody className="divide-y divide-slate-100 ">
                {" "}
                {ledger.map((entry) => {
                  const isCredit = [
                    "INITIAL_CAPITAL",
                    "TRADE_CREDIT",
                    "RESET",
                  ].includes(entry.entry_type);
                  return (
                    <tr
                      key={entry.id}
                      className="hover:bg-slate-50/50 :bg-white/30"
                    >
                      {" "}
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">
                        {" "}
                        {new Date(entry.created_at).toLocaleString()}{" "}
                      </td>{" "}
                      <td className="px-4 py-3">
                        {" "}
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md ${isCredit ? "bg-emerald-50 text-emerald-600 border border-emerald-200 " : "bg-rose-50 text-rose-600 border border-rose-200 "}`}
                        >
                          {" "}
                          {isCredit ? (
                            <ArrowDownLeft className="w-3 h-3" />
                          ) : (
                            <ArrowUpRight className="w-3 h-3" />
                          )}{" "}
                          {entry.entry_type}{" "}
                        </span>{" "}
                      </td>{" "}
                      <td className="px-4 py-3 text-slate-700 ">
                        {" "}
                        {entry.description}{" "}
                      </td>{" "}
                      <td
                        className={`px-4 py-3 text-right font-mono font-bold ${isCredit ? "text-emerald-600 " : "text-rose-600 "}`}
                      >
                        {" "}
                        {isCredit ? "+" : "-"}
                        {formatINR(entry.amount)}{" "}
                      </td>{" "}
                      <td className="px-4 py-3 text-right font-mono text-slate-700 ">
                        {" "}
                        {formatINR(entry.balance_after)}{" "}
                      </td>{" "}
                    </tr>
                  );
                })}{" "}
              </tbody>{" "}
            </table>{" "}
          </div>
        )}{" "}
      </div>{" "}
      {/* Virtual Account Policies Footnote */}{" "}
      <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 flex items-start gap-4">
        {" "}
        <HelpCircle className="w-5 h-5 text-slate-500 mt-0.5 shrink-0" />{" "}
        <div className="text-xs text-slate-600 leading-relaxed">
          {" "}
          <span className="font-semibold text-slate-800 ">
            Milestone Notice:
          </span>{" "}
          Real money deposit integration, credit card top-ups, and account reset
          utilities are disabled in this paper-trading environment. Account
          funds are strictly virtual and reset capabilities will be introduced
          in future system updates.{" "}
        </div>{" "}
      </div>{" "}
    </div>
  );
};
export default AccountPage;
