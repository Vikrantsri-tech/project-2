export interface LanguageOption {
  id: string;
  label: string;
  monacoId: string;
  extension: string;
  boilerplate: string;
}

export const LANGUAGES: LanguageOption[] = [
  {
    id: 'cpp',
    label: 'C++',
    monacoId: 'cpp',
    extension: 'cpp',
    boilerplate: `#include <iostream>
using namespace std;

int main() {
    cout << "Hello, World!" << endl;
    return 0;
}`,
  },
  {
    id: 'c',
    label: 'C',
    monacoId: 'c',
    extension: 'c',
    boilerplate: `#include <stdio.h>

int main() {
    printf("Hello, World!\\n");
    return 0;
}`,
  },
  {
    id: 'java',
    label: 'Java',
    monacoId: 'java',
    extension: 'java',
    boilerplate: `public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}`,
  },
  {
    id: 'python',
    label: 'Python',
    monacoId: 'python',
    extension: 'py',
    boilerplate: `print("Hello, World!")`,
  },
  {
    id: 'javascript',
    label: 'JavaScript',
    monacoId: 'javascript',
    extension: 'js',
    boilerplate: `console.log("Hello, World!");`,
  },
  {
    id: 'typescript',
    label: 'TypeScript',
    monacoId: 'typescript',
    extension: 'ts',
    boilerplate: `console.log("Hello, World!");`,
  },
  {
    id: 'rust',
    label: 'Rust',
    monacoId: 'rust',
    extension: 'rs',
    boilerplate: `fn main() {
    println!("Hello, World!");
}`,
  },
  {
    id: 'go',
    label: 'Go',
    monacoId: 'go',
    extension: 'go',
    boilerplate: `package main

import "fmt"

func main() {
    fmt.Println("Hello, World!")
}`,
  },
  {
    id: 'ruby',
    label: 'Ruby',
    monacoId: 'ruby',
    extension: 'rb',
    boilerplate: `puts "Hello, World!"`,
  },
  {
    id: 'php',
    label: 'PHP',
    monacoId: 'php',
    extension: 'php',
    boilerplate: `<?php
echo "Hello, World!\\n";`,
  },
  {
    id: 'csharp',
    label: 'C#',
    monacoId: 'csharp',
    extension: 'cs',
    boilerplate: `using System;

class Program {
    static void Main() {
        Console.WriteLine("Hello, World!");
    }
}`,
  },
  {
    id: 'swift',
    label: 'Swift',
    monacoId: 'swift',
    extension: 'swift',
    boilerplate: `print("Hello, World!")`,
  },
  {
    id: 'bash',
    label: 'Bash',
    monacoId: 'shell',
    extension: 'sh',
    boilerplate: `echo "Hello, World!"`,
  },
];

export function getLanguage(id: string): LanguageOption {
  return LANGUAGES.find((l) => l.id === id) || LANGUAGES[0];
}
