import { Injectable, inject, signal } from '@angular/core';
import { TitleStrategy, RouterStateSnapshot } from '@angular/router';
import { Title } from '@angular/platform-browser';

@Injectable()
export class PageTitleStrategy extends TitleStrategy {
  readonly title = signal<string>('Worth It');
  private readonly titleService = inject(Title);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const title = this.buildTitle(snapshot);

    if (title) {
      this.titleService.setTitle(`Worth It · ${title}`);
      this.title.set(title);
    } else {
      this.titleService.setTitle('Worth It');
      this.title.set('Worth It');
    }
  }
}
