import { Resource } from './baseResource.js';

export class PatientGroupResource extends Resource<any> {
  transform() {
    return {
      id: this.data.id,
      value: String(this.data.id),
      label: this.data.name,
      name: this.data.name,
      description: this.data.description,
      is_active: this.data.is_active,
    };
  }
}
