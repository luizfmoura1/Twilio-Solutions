"""
Script para configurar workers (SDRs) no sistema.
- Adiciona colunas novas ao banco
- Cria usuários Arthur e Eduarda
- Atualiza chamadas existentes para Arthur
"""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app, db
from models.user import User
from models.call import Call
from sqlalchemy import text


def setup_workers():
    with app.app_context():
        print("[SETUP] Iniciando configuração de workers...")

        # 1. Adicionar coluna worker_email na tabela calls (se não existir)
        print("[SETUP] Verificando coluna worker_email em calls...")
        try:
            db.session.execute(text("ALTER TABLE calls ADD COLUMN worker_email VARCHAR(255)"))
            db.session.commit()
            print("[SETUP] ✓ Coluna worker_email adicionada")
        except Exception as e:
            db.session.rollback()
            if "already exists" in str(e).lower() or "duplicate" in str(e).lower():
                print("[SETUP] ✓ Coluna worker_email já existe")
            else:
                print(f"[SETUP] Aviso: {e}")

        # 2. Adicionar coluna name na tabela users (se não existir)
        print("[SETUP] Verificando coluna name em users...")
        try:
            db.session.execute(text("ALTER TABLE users ADD COLUMN name VARCHAR(100)"))
            db.session.commit()
            print("[SETUP] ✓ Coluna name adicionada")
        except Exception as e:
            db.session.rollback()
            if "already exists" in str(e).lower() or "duplicate" in str(e).lower():
                print("[SETUP] ✓ Coluna name já existe")
            else:
                print(f"[SETUP] Aviso: {e}")

        # 3. Criar usuário Arthur
        print("[SETUP] Criando usuário Arthur...")
        arthur = User.query.filter_by(email='arthur@fyntrainc.com').first()
        if not arthur:
            arthur = User(email='arthur@fyntrainc.com', name='Arthur')
            arthur.set_password('fyntra2025')
            db.session.add(arthur)
            db.session.commit()
            print("[SETUP] ✓ Usuário Arthur criado")
        else:
            # Atualizar nome se necessário
            if not arthur.name:
                arthur.name = 'Arthur'
                db.session.commit()
            print("[SETUP] ✓ Usuário Arthur já existe")

        # 4. Criar usuário Eduarda
        print("[SETUP] Criando usuário Eduarda...")
        eduarda = User.query.filter_by(email='eduarda@fyntrainc.com').first()
        if not eduarda:
            eduarda = User(email='eduarda@fyntrainc.com', name='Eduarda')
            eduarda.set_password('fyntra2025')
            db.session.add(eduarda)
            db.session.commit()
            print("[SETUP] ✓ Usuário Eduarda criado")
        else:
            # Atualizar nome se necessário
            if not eduarda.name:
                eduarda.name = 'Eduarda'
                db.session.commit()
            print("[SETUP] ✓ Usuário Eduarda já existe")

        # 5. Atualizar todas as chamadas existentes para Arthur
        print("[SETUP] Atualizando chamadas existentes para Arthur...")
        calls_updated = Call.query.filter(
            (Call.worker_email == None) | (Call.worker_email == '')
        ).update({
            'worker_email': 'arthur@fyntrainc.com',
            'worker_name': 'Arthur'
        })
        db.session.commit()
        print(f"[SETUP] ✓ {calls_updated} chamadas atualizadas para Arthur")

        # 6. Resumo
        print("\n[SETUP] ========== RESUMO ==========")
        total_users = User.query.count()
        total_calls = Call.query.count()
        print(f"[SETUP] Total de usuários: {total_users}")
        print(f"[SETUP] Total de chamadas: {total_calls}")

        users = User.query.all()
        for user in users:
            print(f"[SETUP]   - {user.name or 'Sem nome'} ({user.email})")

        print("[SETUP] ================================")
        print("[SETUP] ✓ Configuração concluída!")


if __name__ == '__main__':
    setup_workers()
