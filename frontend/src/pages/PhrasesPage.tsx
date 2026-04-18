import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Plus, Edit2, Trash2, ToggleLeft, ToggleRight, Download, Upload, X, ArrowLeft } from 'lucide-react';
import { Phrase, CATEGORIES } from '@/types';

interface PhrasesPageProps {
  phrases: Phrase[];
  onUpdate: (id: string, updates: Partial<Phrase>) => void;
  onAdd: (text: string, category: string) => void;
  onDelete: (id: string) => void;
  onExport: () => void;
  onImport: (json: string) => boolean;
}

export default function PhrasesPage({
  phrases,
  onUpdate,
  onAdd,
  onDelete,
  onExport,
  onImport,
}: PhrasesPageProps) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('全部');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newText, setNewText] = useState('');
  const [newCategory, setNewCategory] = useState<string>(CATEGORIES[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const filtered = useMemo(() => {
    return phrases.filter((p) => {
      if (selectedCategory !== '全部' && p.category !== selectedCategory) return false;
      if (search && !p.text.includes(search)) return false;
      return true;
    });
  }, [phrases, selectedCategory, search]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    phrases.forEach((p) => {
      counts[p.category] = (counts[p.category] || 0) + 1;
    });
    return counts;
  }, [phrases]);

  const handleAdd = () => {
    if (newText.trim()) {
      onAdd(newText.trim(), newCategory);
      setNewText('');
      setShowAddForm(false);
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const success = onImport(reader.result as string);
      if (!success) alert('导入失败，请检查文件格式');
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <section className="max-w-2xl mx-auto space-y-5" aria-labelledby="phrases-heading">
      <button
        onClick={() => navigate('/settings')}
        className="a11y-target inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        aria-label="返回设置"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        返回设置
      </button>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 id="phrases-heading" className="text-xl md:text-2xl font-bold text-foreground">词表管理</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">共 {phrases.length} 条短语</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={onExport}
            className="a11y-target inline-flex items-center gap-1.5 rounded-xl border border-border px-3.5 py-2 text-sm text-foreground hover:bg-muted transition-colors"
            aria-label="导出词表"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            导出
          </button>
          <label className="a11y-target inline-flex items-center gap-1.5 rounded-xl border border-border px-3.5 py-2 text-sm text-foreground hover:bg-muted transition-colors cursor-pointer" tabIndex={0} role="button" aria-label="导入词表">
            <Upload className="h-4 w-4" aria-hidden="true" />
            导入
            <input type="file" accept=".json" onChange={handleImportFile} className="hidden" aria-hidden="true" />
          </label>
          <button
            onClick={() => setShowAddForm(true)}
            className="a11y-target inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
            aria-label="新增短语"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            新增
          </button>
        </div>
      </div>

      {/* Add Form */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-xl border border-primary/30 bg-card p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-foreground">新增短语</h3>
              <button onClick={() => setShowAddForm(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="输入短语..."
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                autoFocus
              />
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <button
                onClick={handleAdd}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                添加
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索短语..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-input bg-card py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* Category chips — enlarged for motor accessibility */}
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="筛选分类">
        <button
          onClick={() => setSelectedCategory('全部')}
          className={`a11y-target rounded-full px-4 py-2 text-sm font-medium transition-colors ${
            selectedCategory === '全部'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:text-foreground'
          }`}
          role="radio"
          aria-checked={selectedCategory === '全部'}
        >
          全部 ({phrases.length})
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setSelectedCategory(c)}
            className={`a11y-target rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              selectedCategory === c
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
            role="radio"
            aria-checked={selectedCategory === c}
          >
            {c} ({categoryCounts[c] || 0})
          </button>
        ))}
      </div>

      {/* Phrase List */}
      <div className="space-y-2">
        {filtered.map((phrase) => (
          <div
            key={phrase.id}
            className={`flex items-center justify-between rounded-xl border bg-card p-4 transition-colors ${
              phrase.enabled ? 'border-border' : 'border-border opacity-50'
            }`}
          >
            <div className="flex-1 min-w-0">
              {editingId === phrase.id ? (
                <input
                  type="text"
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      onUpdate(phrase.id, { text: editText });
                      setEditingId(null);
                    } else if (e.key === 'Escape') {
                      setEditingId(null);
                    }
                  }}
                  onBlur={() => {
                    onUpdate(phrase.id, { text: editText });
                    setEditingId(null);
                  }}
                  className="w-full rounded border border-input bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  autoFocus
                />
              ) : (
                <div>
                  <span className="font-medium text-foreground">{phrase.text}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{phrase.category}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 ml-3">
              <button
                onClick={() => {
                  setEditingId(phrase.id);
                  setEditText(phrase.text);
                }}
                className="a11y-target rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label={`编辑「${phrase.text}」`}
              >
                <Edit2 className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                onClick={() => onUpdate(phrase.id, { enabled: !phrase.enabled })}
                className="a11y-target rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label={phrase.enabled ? `禁用「${phrase.text}」` : `启用「${phrase.text}」`}
                role="switch"
                aria-checked={phrase.enabled}
              >
                {phrase.enabled ? (
                  <ToggleRight className="h-5 w-5 text-success" aria-hidden="true" />
                ) : (
                  <ToggleLeft className="h-5 w-5" aria-hidden="true" />
                )}
              </button>
              <button
                onClick={() => onDelete(phrase.id)}
                className="a11y-target rounded-md p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                aria-label={`删除「${phrase.text}」`}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
