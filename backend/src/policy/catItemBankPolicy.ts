export class CatItemBankPolicy {
  constructor(private authUser: { id: string; role?: string } | null) {}

  view(_target: any): boolean {
    if (!this.authUser) return false;
    return true;
  }

  update(_target: any): boolean {
    if (!this.authUser) return false;
    return true;
  }

  delete(target: any): boolean {
    return (target?._count?.modules ?? 0) === 0;
  }

  create(): boolean {
    if (!this.authUser) return false;
    return true;
  }

  getAuthorizations(target: any): Record<string, boolean> {
    return {
      view: this.view(target),
      update: this.update(target),
      delete: this.delete(target),
    };
  }
}
