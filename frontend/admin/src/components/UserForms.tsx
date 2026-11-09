import { Button, Checkbox, Field, Input, Select } from '@thunikart/ui';
import { useRoles } from '../features/roles/use-roles';
import { useCreateUserForm, useEditUserForm, useResetPasswordForm, type User } from '../features/users/use-users';
import { ErrorBanner } from './ErrorBanner';

function RoleSelect({ p, reg }: { p: Record<string, unknown>; reg: object }) {
  const roles = useRoles();
  return (
    <Select {...p} {...reg}>
      <option value="">Choose a role</option>
      {roles.data?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
    </Select>
  );
}

export function CreateUserForm({ onDone }: { onDone: () => void }) {
  const { form, submit, banner, saving } = useCreateUserForm(onDone);
  const { register, formState: { errors } } = form;
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4" aria-label="Add user">
      {banner && <ErrorBanner {...banner} />}
      <Field label="Name" required error={errors.name?.message}>{(p) => <Input {...p} {...register('name')} />}</Field>
      <Field label="Email" required error={errors.email?.message}>{(p) => <Input {...p} type="email" {...register('email')} />}</Field>
      <Field label="Mobile" hint="10 digit Indian mobile number" error={errors.mobile?.message}>{(p) => <Input {...p} inputMode="tel" {...register('mobile', { setValueAs: (v: string) => (v === '' ? undefined : v) })} />}</Field>
      <Field label="Password" required hint="At least 10 characters with letters and digits" error={errors.password?.message}>{(p) => <Input {...p} type="password" autoComplete="new-password" {...register('password')} />}</Field>
      <Field label="Role" required error={errors.roleId?.message}>{(p) => <RoleSelect p={p} reg={register('roleId')} />}</Field>
      <Checkbox label="Active" {...register('active')} />
      <Button type="submit" variant="primary" loading={saving}>Add user</Button>
    </form>
  );
}

export function EditUserForm({ user, onDone }: { user: User; onDone: () => void }) {
  const { form, submit, banner, saving } = useEditUserForm(user, onDone);
  const { register, formState: { errors } } = form;
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4" aria-label={`Edit ${user.name}`}>
      {banner && <ErrorBanner {...banner} />}
      <p className="text-sm text-muted">{user.email}</p>
      <Field label="Name" required error={errors.name?.message}>{(p) => <Input {...p} {...register('name')} />}</Field>
      <Field label="Mobile" error={errors.mobile?.message}>{(p) => <Input {...p} inputMode="tel" {...register('mobile', { setValueAs: (v: string) => (v === '' ? null : v) })} />}</Field>
      <Field label="Role" required error={errors.roleId?.message}>{(p) => <RoleSelect p={p} reg={register('roleId')} />}</Field>
      <Checkbox label="Active" {...register('active')} />
      <Button type="submit" variant="primary" loading={saving}>Save user</Button>
    </form>
  );
}

export function ResetPasswordForm({ user, onDone }: { user: User; onDone: () => void }) {
  const { form, submit, banner, saving } = useResetPasswordForm(user, onDone);
  const { register, formState: { errors } } = form;
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4" aria-label={`Reset password for ${user.name}`}>
      {banner && <ErrorBanner {...banner} />}
      <Field label="New password" required hint="At least 10 characters with letters and digits" error={errors.password?.message}>{(p) => <Input {...p} type="password" autoComplete="new-password" {...register('password')} />}</Field>
      <Button type="submit" variant="primary" loading={saving}>Reset password</Button>
    </form>
  );
}
