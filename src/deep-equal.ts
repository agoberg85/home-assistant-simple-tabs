export function deepEqual(a: any, b: any): boolean {
    if (a === b) return true;
  
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      if (a.constructor !== b.constructor) return false;
  
      if (Array.isArray(a)) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
          if (!deepEqual(a[i], b[i])) return false;
        }
        return true;
      }
  
      if (a instanceof Map && b instanceof Map) {
        if (a.size !== b.size) return false;
        for (const [key, value] of a.entries()) {
          if (!b.has(key) || !deepEqual(value, b.get(key))) return false;
        }
        return true;
      }
  
      if (a instanceof Set && b instanceof Set) {
        if (a.size !== b.size) return false;
        for (const value of a.entries()) {
          if (!b.has(value)) return false;
        }
        return true;
      }
      
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
  
      if (keysA.length !== keysB.length) return false;
      
      for (const key of keysA) {
        if (!keysB.includes(key) || !deepEqual(a[key], b[key])) return false;
      }
      
      return true;
    }
    
    return false;
  }