import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Mic, Mail, Phone, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type AuthMode = 'login' | 'signup';
type AuthMethod = 'email' | 'phone';

export default function AuthPage() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [method, setMethod] = useState<AuthMethod>('email');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleEmailAuth = async () => {
    setLoading(true);
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName || email },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        toast({
          title: '注册成功',
          description: '请查收验证邮件，点击链接完成验证后即可登录。',
        });
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
    } catch (err: any) {
      toast({
        title: '操作失败',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneSendOtp = async () => {
    setLoading(true);
    try {
      const cleanPhone = phone.replace(/\D/g, '');
      // TODO(portability): route through Worker `/api/sms-send-otp` instead of
      // calling Supabase Edge Functions directly. Currently disabled (ICP), so
      // this code path is unreachable; fix before re-enabling auth.
      const { data, error } = await supabase.functions.invoke('sms-send-otp', {
        body: { phone: cleanPhone },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setOtpSent(true);
      toast({
        title: '验证码已发送',
        description: data?.dev_code
          ? `开发模式验证码: ${data.dev_code}`
          : '请查收短信验证码，5分钟内有效。',
      });
    } catch (err: any) {
      toast({
        title: '发送失败',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneVerifyOtp = async () => {
    setLoading(true);
    try {
      const cleanPhone = phone.replace(/\D/g, '');
      // TODO(portability): route through Worker `/api/sms-verify-otp` (see above).
      const { data, error } = await supabase.functions.invoke('sms-verify-otp', {
        body: { phone: cleanPhone, code: otp, displayName: displayName || undefined },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.session?.token_hash && data?.session?.email) {
        // Use verifyOtp to exchange the token_hash for a real session
        const { error: verifyErr } = await supabase.auth.verifyOtp({
          email: data.session.email,
          token_hash: data.session.token_hash,
          type: 'magiclink',
        });
        if (verifyErr) throw verifyErr;
      }

      toast({ title: '登录成功' });
    } catch (err: any) {
      toast({
        title: '验证失败',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      toast({ title: '请输入邮箱地址', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast({
        title: '重置邮件已发送',
        description: '请查收邮箱中的密码重置链接。',
      });
    } catch (err: any) {
      toast({ title: '发送失败', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary">
            <Mic className="h-7 w-7 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl font-bold">共鸣</CardTitle>
          <CardDescription>Project Resonance · 语音识别训练系统</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Login / Signup toggle */}
          <Tabs value={mode} onValueChange={(v) => { setMode(v as AuthMode); setOtpSent(false); }}>
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="login">登录</TabsTrigger>
              <TabsTrigger value="signup">注册</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Method toggle */}
          <Tabs value={method} onValueChange={(v) => { setMethod(v as AuthMethod); setOtpSent(false); }}>
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="email" className="gap-1.5">
                <Mail className="h-4 w-4" /> 邮箱
              </TabsTrigger>
              <TabsTrigger value="phone" className="gap-1.5" disabled>
                <Phone className="h-4 w-4" /> 手机号
                <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">即将上线</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="email" className="space-y-4">
              {mode === 'signup' && (
                <div className="space-y-2">
                  <Label htmlFor="displayName">昵称</Label>
                  <Input
                    id="displayName"
                    placeholder="您的昵称（可选）"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">邮箱地址</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">密码</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="至少6位密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button className="w-full" onClick={handleEmailAuth} disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {mode === 'login' ? '登录' : '注册'}
              </Button>
              {mode === 'login' && (
                <Button variant="link" className="w-full text-sm" onClick={handleForgotPassword} disabled={loading}>
                  忘记密码？
                </Button>
              )}
            </TabsContent>

            <TabsContent value="phone" className="space-y-4">
              {mode === 'signup' && (
                <div className="space-y-2">
                  <Label htmlFor="phoneDisplayName">昵称</Label>
                  <Input
                    id="phoneDisplayName"
                    placeholder="您的昵称（可选）"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="phone">手机号</Label>
                <div className="flex gap-2">
                  <span className="flex h-10 items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground">
                    +86
                  </span>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="请输入手机号"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="flex-1"
                  />
                </div>
              </div>
              {!otpSent ? (
                <Button className="w-full" onClick={handlePhoneSendOtp} disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  发送验证码
                </Button>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="otp">验证码</Label>
                    <Input
                      id="otp"
                      type="text"
                      placeholder="输入6位验证码"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      maxLength={6}
                    />
                  </div>
                  <Button className="w-full" onClick={handlePhoneVerifyOtp} disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    验证并{mode === 'login' ? '登录' : '注册'}
                  </Button>
                  <Button variant="ghost" className="w-full text-sm" onClick={() => setOtpSent(false)}>
                    重新发送
                  </Button>
                </>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
