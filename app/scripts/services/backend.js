import { isSupabaseConfigured, requireSupabase, supabase } from './supabase.js';

const ATTACHMENTS_BUCKET = 'comprovantes-financeiros';
const REPORTS_BUCKET = 'relatorios-publicados';

function check(error) {
  if (error) throw error;
}

function mapProfile(profile, user) {
  return {
    id: profile.id,
    name: profile.full_name || user?.email || 'Usuário',
    email: user?.email || '',
    role: profile.role,
    active: profile.active
  };
}

function mapEntry(row) {
  return {
    id: row.id,
    type: row.type,
    date: row.transaction_date,
    description: row.description,
    category: row.financial_categories?.name || '',
    categoryId: row.category_id,
    method: row.payment_method || '',
    value: Number(row.amount),
    notes: row.notes || '',
    attachments: (row.attachments || []).map(item => ({
      id: item.id,
      name: item.file_name,
      type: item.mime_type,
      size: Number(item.file_size || 0),
      createdAt: item.created_at,
      storagePath: item.storage_path,
      storageBucket: item.storage_bucket
    }))
  };
}

function reportPayload(report, userId, status) {
  return {
    title: report.title,
    period_type: report.periodType,
    start_date: report.startDate,
    end_date: report.endDate,
    total_income: report.totalIncome,
    total_expense: report.totalExpense,
    opening_balance: report.openingBalance,
    closing_balance: report.closingBalance,
    status,
    observations: report.observations || null,
    report_snapshot: report.snapshot || null,
    updated_by: userId
  };
}

export const backend = {
  mode: isSupabaseConfigured ? 'supabase' : 'local',
  configured: isSupabaseConfigured,

  async session() {
    if (!supabase) return null;
    const { data, error } = await supabase.auth.getSession();
    check(error);
    return data.session;
  },

  async signIn(email, password) {
    const client = requireSupabase();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    check(error);
    const profile = await this.profile(data.user.id);
    if (!profile.active) {
      await client.auth.signOut();
      throw new Error('Este usuário está inativo. Procure o administrador.');
    }
    return mapProfile(profile, data.user);
  },

  async signOut() {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    check(error);
  },

  onAuthStateChange(callback) {
    if (!supabase) return () => {};
    const { data } = supabase.auth.onAuthStateChange(callback);
    return () => data.subscription.unsubscribe();
  },

  async profile(userId) {
    const client = requireSupabase();
    const { data, error } = await client.from('profiles').select('*').eq('id', userId).single();
    check(error);
    return data;
  },

  async currentUser(existingSession = null) {
    const session = existingSession || await this.session();
    if (!session?.user) return null;
    const profile = await this.profile(session.user.id);
    return mapProfile(profile, session.user);
  },

  async beginVisitorSession(name, clientToken) {
    const client = requireSupabase();
    const { data, error } = await client.rpc('begin_visitor_session', {
      p_visitor_name: name,
      p_client_token: clientToken
    });
    check(error);
    return { id: data, name, clientToken };
  },

  async resumeVisitorSession(sessionId, clientToken) {
    const client = requireSupabase();
    const { data, error } = await client.rpc('resume_visitor_session', {
      p_session_id: sessionId,
      p_client_token: clientToken
    });
    check(error);
    return data || null;
  },

  async visitorActivity(visitor, action, recordId = null, metadata = {}) {
    if (!visitor?.id || !visitor?.clientToken) return null;
    const client = requireSupabase();
    const { data, error } = await client.rpc('record_visitor_activity', {
      p_session_id: visitor.id,
      p_client_token: visitor.clientToken,
      p_action: action,
      p_record_id: recordId,
      p_metadata: metadata
    });
    check(error);
    return data;
  },

  async logActivity(action, {
    tableName = 'application',
    recordId = null,
    description = null,
    result = 'success',
    metadata = {}
  } = {}) {
    if (!supabase) return null;
    const { data, error } = await supabase.rpc('record_user_activity', {
      p_action: action,
      p_table_name: tableName,
      p_record_id: recordId,
      p_description: description,
      p_result: result,
      p_metadata: metadata
    });
    check(error);
    return data;
  },

  async activityLogs(limit = 500) {
    const client = requireSupabase();
    const { data, error } = await client
      .from('audit_logs')
      .select('id,user_id,actor_type,actor_name,actor_role,visitor_session_id,action,table_name,record_id,description,result,old_data,new_data,metadata,created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    check(error);
    return data || [];
  },

  async categories() {
    const client = requireSupabase();
    const { data, error } = await client.from('financial_categories').select('id,name,type').eq('active', true).order('sort_order');
    check(error);
    return data;
  },

  async entries(startDate, endDate) {
    const client = requireSupabase();
    const { data, error } = await client
      .from('financial_entries')
      .select('*, financial_categories(name), attachments(*)')
      .gte('transaction_date', startDate)
      .lte('transaction_date', endDate)
      .eq('status', 'ativo')
      .order('transaction_date');
    check(error);
    return data.map(mapEntry);
  },

  async saveEntry(entry, userId) {
    const client = requireSupabase();
    let categoryId = entry.categoryId || null;
    if (!categoryId && entry.category) {
      const { data, error } = await client.from('financial_categories').select('id').eq('name', entry.category).eq('type', entry.type).maybeSingle();
      check(error);
      categoryId = data?.id || null;
    }
    const payload = {
      type: entry.type,
      category_id: categoryId,
      description: entry.description,
      amount: entry.value,
      transaction_date: entry.date,
      payment_method: entry.method || null,
      notes: entry.notes || null,
      updated_by: userId
    };
    if (entry.id) {
      const { data, error } = await client.from('financial_entries').update(payload).eq('id', entry.id).select().single();
      check(error);
      return { id: data.id, updatedAt: data.updated_at };
    }
    const { data, error } = await client.from('financial_entries').insert({ ...payload, created_by: userId }).select().single();
    check(error);
    return { id: data.id, updatedAt: data.updated_at };
  },

  async deleteEntry(id) {
    const client = requireSupabase();
    const { error } = await client.from('financial_entries').delete().eq('id', id);
    check(error);
  },

  async publishedReports() {
    const client = requireSupabase();
    const { data, error } = await client.rpc('list_public_reports');
    check(error);
    return data || [];
  },

  async publishedReport(reportId, visitor) {
    const client = requireSupabase();
    const { data, error } = await client.rpc('get_public_report', {
      p_report_id: reportId,
      p_session_id: visitor.id,
      p_client_token: visitor.clientToken
    });
    check(error);
    return data;
  },

  async downloadPublishedReport(path) {
    const client = requireSupabase();
    const { data, error } = await client.storage.from(REPORTS_BUCKET).download(path);
    check(error);
    return data;
  },

  async saveReportDraft(report, userId) {
    const client = requireSupabase();
    const payload = reportPayload(report, userId, 'rascunho');
    if (report.id) {
      const { data, error } = await client.from('reports').update(payload).eq('id', report.id).select().single();
      check(error);
      return data;
    }
    const { data, error } = await client.from('reports').insert({
      ...payload,
      created_by: userId
    }).select().single();
    check(error);
    return data;
  },

  async publishReport(report, userId) {
    const client = requireSupabase();
    const payload = {
      ...reportPayload(report, userId, 'publicado'),
      published_at: new Date().toISOString(),
      published_by: userId,
    };
    if (report.id) {
      const { data, error } = await client.from('reports').update(payload).eq('id', report.id).select().single();
      check(error);
      return data;
    }
    const { data, error } = await client.from('reports').insert({
      ...payload,
      created_by: userId
    }).select().single();
    check(error);
    return data;
  },

  async uploadAttachment({ file, entryId, reportId, userId }) {
    const client = requireSupabase();
    const owner = entryId || reportId;
    const path = `${userId}/${owner}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { error: uploadError } = await client.storage.from(ATTACHMENTS_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    check(uploadError);
    const { data, error } = await client.from('attachments').insert({
      entry_id: entryId || null,
      report_id: reportId || null,
      file_name: file.name,
      storage_bucket: ATTACHMENTS_BUCKET,
      storage_path: path,
      mime_type: file.type,
      file_size: file.size,
      uploaded_by: userId
    }).select().single();
    check(error);
    return data;
  },

  async signedAttachmentUrl(path, bucket = ATTACHMENTS_BUCKET) {
    const client = requireSupabase();
    const { data, error } = await client.storage.from(bucket).createSignedUrl(path, 300);
    check(error);
    return data.signedUrl;
  },

  async deleteAttachment(meta) {
    const client = requireSupabase();
    if (meta.storagePath) {
      const { error: storageError } = await client.storage.from(meta.storageBucket || ATTACHMENTS_BUCKET).remove([meta.storagePath]);
      check(storageError);
    }
    const { error } = await client.from('attachments').delete().eq('id', meta.id);
    check(error);
  },

  buckets: Object.freeze({ attachments: ATTACHMENTS_BUCKET, reports: REPORTS_BUCKET })
};
