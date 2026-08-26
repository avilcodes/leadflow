'use client';

import { useState, useEffect } from 'react';
import { Shield, Zap, Brain, Mail, Search, Database, CheckCircle, XCircle, Loader2, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';

interface Credential {
  id: string;
  provider: string;
  maskedKey: string;
  hasKey: boolean;
  testStatus: string | null;
  lastTestedAt: string | null;
  config: Record<string, unknown> | null;
}

const PROVIDERS = [
  { key: 'apollo', name: 'Apollo.io', icon: Search, description: 'Lead search and contact database', color: 'text-blue-400' },
  { key: 'prospeo', name: 'Prospeo', icon: Search, description: 'Email finder and domain search', color: 'text-cyan-400' },
  { key: 'deepenrich', name: 'Deepenrich', icon: Database, description: 'Lead data enrichment', color: 'text-purple-400' },
  { key: 'apify', name: 'Apify', icon: Zap, description: 'Web scraping and enrichment actors', color: 'text-yellow-400' },
  { key: 'openrouter', name: 'OpenRouter', icon: Brain, description: 'AI analysis and email generation', color: 'text-green-400' },
  { key: 'brevo', name: 'Brevo', icon: Mail, description: 'Email sending and tracking', color: 'text-orange-400' },
];

export default function SettingsPage() {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchCredentials();
  }, []);

  async function fetchCredentials() {
    try {
      const res = await fetch('/api/settings/credentials');
      const data = await res.json();
      if (data.success) setCredentials(data.data);
    } catch {
      toast.error('Failed to load credentials');
    } finally {
      setLoading(false);
    }
  }

  async function saveCredential(provider: string) {
    const apiKey = apiKeys[provider];
    if (!apiKey) { toast.error('Enter an API key'); return; }

    setSaving(s => ({ ...s, [provider]: true }));
    try {
      const res = await fetch('/api/settings/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`${provider} API key saved`);
        setApiKeys(k => ({ ...k, [provider]: '' }));
        fetchCredentials();
      } else {
        toast.error(data.error || 'Failed to save');
      }
    } catch {
      toast.error('Failed to save credential');
    } finally {
      setSaving(s => ({ ...s, [provider]: false }));
    }
  }

  async function testConnection(provider: string) {
    setTesting(t => ({ ...t, [provider]: true }));
    try {
      const res = await fetch(`/api/settings/credentials/${provider}/test`, { method: 'POST' });
      const data = await res.json();
      if (data.success && data.data.success) {
        toast.success(`${provider}: ${data.data.message}`);
      } else {
        toast.error(`${provider}: ${data.data?.message || data.error || 'Test failed'}`);
      }
      fetchCredentials();
    } catch {
      toast.error('Connection test failed');
    } finally {
      setTesting(t => ({ ...t, [provider]: false }));
    }
  }

  function getCredential(provider: string) {
    return credentials.find(c => c.provider === provider);
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="h-32 bg-slate-800 rounded-lg" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Settings & Integrations</h1>
        <p className="text-slate-400 mt-1">Configure your API connections and integrations</p>
      </div>

      <div className="space-y-4">
        {PROVIDERS.map(({ key, name, icon: Icon, description, color }) => {
          const cred = getCredential(key);
          const status = cred?.testStatus;

          return (
            <div key={key} className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg bg-slate-700/50 ${color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold">{name}</h3>
                    <p className="text-sm text-slate-400">{description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {status === 'connected' && (
                    <span className="flex items-center gap-1 text-green-400 text-sm">
                      <CheckCircle className="w-4 h-4" /> Connected
                    </span>
                  )}
                  {status === 'failed' && (
                    <span className="flex items-center gap-1 text-red-400 text-sm">
                      <XCircle className="w-4 h-4" /> Failed
                    </span>
                  )}
                  {(!status || status === 'untested') && cred && (
                    <span className="text-yellow-400 text-sm">Untested</span>
                  )}
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-1 relative">
                  <input
                    type={showKeys[key] ? 'text' : 'password'}
                    placeholder={cred?.maskedKey ? `Current: ${cred.maskedKey}` : 'Enter API key'}
                    value={apiKeys[key] || ''}
                    onChange={e => setApiKeys(k => ({ ...k, [key]: e.target.value }))}
                    className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 pr-10"
                  />
                  <button
                    onClick={() => setShowKeys(s => ({ ...s, [key]: !s[key] }))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    {showKeys[key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <button
                  onClick={() => saveCredential(key)}
                  disabled={saving[key] || !apiKeys[key]}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {saving[key] ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                  Save
                </button>
                {cred && (
                  <button
                    onClick={() => testConnection(key)}
                    disabled={testing[key]}
                    className="px-4 py-2 border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {testing[key] ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    Test
                  </button>
                )}
              </div>

              {cred?.lastTestedAt && (
                <p className="text-xs text-slate-500 mt-2">
                  Last tested: {new Date(cred.lastTestedAt).toLocaleString()}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Email Safety Settings */}
      <div className="mt-8 bg-slate-800/50 border border-slate-700 rounded-lg p-6">
        <h3 className="text-white font-semibold mb-2">Email Sending Safety</h3>
        <p className="text-sm text-slate-400 mb-4">
          Email sending is controlled by the <code className="text-blue-400">EMAIL_SENDING_ENABLED</code> environment variable.
          Set it to <code className="text-green-400">true</code> in your environment to enable sending.
        </p>
        <div className="flex items-center gap-2 text-sm">
          <div className={`w-2 h-2 rounded-full ${process.env.NEXT_PUBLIC_EMAIL_SENDING_ENABLED === 'true' ? 'bg-green-400' : 'bg-red-400'}`} />
          <span className="text-slate-300">
            Sending is currently <strong>{process.env.NEXT_PUBLIC_EMAIL_SENDING_ENABLED === 'true' ? 'enabled' : 'disabled'}</strong>
          </span>
        </div>
      </div>
    </div>
  );
}
